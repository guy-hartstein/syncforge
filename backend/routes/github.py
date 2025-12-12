from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
import httpx

from database import get_db
from models import UserSettings, UpdateIntegration, Integration, UpdateIntegrationStatus
from schemas import GitHubPATRequest, GitHubRepo, GitHubReposResponse


class GitHubPullRequest(BaseModel):
    id: int
    number: int
    title: str
    html_url: str
    state: str
    user_login: str
    created_at: str
    updated_at: str
    draft: bool = False
    head_ref: str
    base_ref: str


class GitHubPullRequestsResponse(BaseModel):
    pull_requests: List[GitHubPullRequest]


class GitHubPRDetails(BaseModel):
    number: int
    title: str
    body: Optional[str] = None
    html_url: str
    state: str
    merged: bool = False
    merged_at: Optional[str] = None
    user_login: str
    head_ref: str
    base_ref: str
    diff: str
    additions: int
    deletions: int
    changed_files: int


class PRStatusResponse(BaseModel):
    state: str  # open, closed
    merged: bool
    merged_at: Optional[str] = None

router = APIRouter(prefix="/api/github", tags=["github"])


class RepoCheckRequest(BaseModel):
    url: str


class RepoCheckResponse(BaseModel):
    is_valid: bool
    is_public: bool
    repo_name: str | None = None
    error: str | None = None


def parse_github_url(url: str) -> tuple[str, str] | None:
    """Extract owner and repo from GitHub URL."""
    url = url.strip().rstrip("/")
    
    prefixes = [
        "https://github.com/",
        "http://github.com/",
        "github.com/",
    ]
    
    for prefix in prefixes:
        if url.startswith(prefix):
            path = url[len(prefix):]
            break
    else:
        return None
    
    parts = path.split("/")
    if len(parts) >= 2:
        owner, repo = parts[0], parts[1]
        repo = repo.removesuffix(".git")
        return owner, repo
    return None


def get_user_settings(db: Session) -> UserSettings | None:
    """Get user settings (single user app)."""
    return db.query(UserSettings).first()


def get_or_create_settings(db: Session) -> UserSettings:
    """Get existing settings or create new ones."""
    settings = db.query(UserSettings).first()
    if not settings:
        settings = UserSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def get_github_token(db: Session) -> str | None:
    """Get the stored GitHub PAT."""
    settings = get_user_settings(db)
    if settings:
        return settings.github_pat
    return None


@router.post("/token")
async def save_github_token(request: GitHubPATRequest, db: Session = Depends(get_db)):
    """Save GitHub Personal Access Token and validate it."""
    # Validate the token by fetching user info
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {request.token}",
                "Accept": "application/vnd.github.v3+json",
            },
            timeout=5.0
        )
        
        if response.status_code == 401:
            raise HTTPException(status_code=400, detail="Invalid token")
        
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to validate token")
        
        user_data = response.json()
        username = user_data.get("login")
    
    # Save token and username
    settings = get_or_create_settings(db)
    settings.github_pat = request.token
    settings.github_username = username
    db.commit()
    
    return {"success": True, "username": username}


@router.delete("/token")
async def delete_github_token(db: Session = Depends(get_db)):
    """Delete GitHub PAT and disconnect."""
    settings = get_user_settings(db)
    if settings:
        settings.github_pat = None
        settings.github_username = None
        db.commit()
    return {"success": True}


@router.get("/status")
async def github_status(db: Session = Depends(get_db)):
    """Check if GitHub is connected."""
    settings = get_user_settings(db)
    
    return {
        "connected": bool(settings and settings.github_pat),
        "username": settings.github_username if settings else None,
    }


@router.get("/repos", response_model=GitHubReposResponse)
async def list_repos(db: Session = Depends(get_db)):
    """List repositories accessible to the authenticated user."""
    token = get_github_token(db)
    if not token:
        raise HTTPException(status_code=401, detail="GitHub not connected")
    
    async with httpx.AsyncClient() as client:
        repos = []
        page = 1
        
        while True:
            response = await client.get(
                "https://api.github.com/user/repos",
                params={
                    "per_page": 100,
                    "page": page,
                    "sort": "updated",
                    "direction": "desc",
                },
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github.v3+json",
                },
                timeout=10.0
            )
            
            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="GitHub token expired or invalid. Please reconnect.")
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch repositories")
            
            data = response.json()
            if not data:
                break
            
            for repo in data:
                repos.append(GitHubRepo(
                    id=repo["id"],
                    name=repo["name"],
                    full_name=repo["full_name"],
                    html_url=repo["html_url"],
                    private=repo["private"],
                    description=repo.get("description"),
                    default_branch=repo.get("default_branch", "main"),
                ))
            
            page += 1
            if len(data) < 100:
                break
    
    return GitHubReposResponse(repos=repos)


@router.post("/check-repo", response_model=RepoCheckResponse)
async def check_repo(request: RepoCheckRequest, db: Session = Depends(get_db)):
    """Check if a GitHub repository is accessible."""
    parsed = parse_github_url(request.url)
    
    if not parsed:
        return RepoCheckResponse(
            is_valid=False,
            is_public=False,
            error="Invalid GitHub URL format"
        )
    
    owner, repo = parsed
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    
    # Get token if available
    token = get_github_token(db)
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(api_url, headers=headers, timeout=5.0)
            
            if response.status_code == 200:
                data = response.json()
                return RepoCheckResponse(
                    is_valid=True,
                    is_public=not data.get("private", True),
                    repo_name=data.get("full_name")
                )
            elif response.status_code == 404:
                return RepoCheckResponse(
                    is_valid=True,
                    is_public=False,
                    repo_name=f"{owner}/{repo}",
                    error="Repository is private or does not exist"
                )
            else:
                return RepoCheckResponse(
                    is_valid=False,
                    is_public=False,
                    error=f"GitHub API error: {response.status_code}"
                )
        except httpx.TimeoutException:
            return RepoCheckResponse(
                is_valid=False,
                is_public=False,
                error="Request timed out"
            )
        except Exception as e:
            return RepoCheckResponse(
                is_valid=False,
                is_public=False,
                error=str(e)
            )


@router.get("/repos/{owner}/{repo}/pulls", response_model=GitHubPullRequestsResponse)
async def list_pull_requests(
    owner: str,
    repo: str,
    state: str = "open",
    db: Session = Depends(get_db)
):
    """List pull requests for a repository."""
    token = get_github_token(db)
    if not token:
        raise HTTPException(status_code=401, detail="GitHub not connected")
    
    async with httpx.AsyncClient() as client:
        pull_requests = []
        page = 1
        
        while True:
            response = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/pulls",
                params={
                    "state": state,
                    "per_page": 100,
                    "page": page,
                    "sort": "updated",
                    "direction": "desc",
                },
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github.v3+json",
                },
                timeout=10.0
            )
            
            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="GitHub token expired or invalid. Please reconnect.")
            
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Repository not found or not accessible")
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch pull requests")
            
            data = response.json()
            if not data:
                break
            
            for pr in data:
                pull_requests.append(GitHubPullRequest(
                    id=pr["id"],
                    number=pr["number"],
                    title=pr["title"],
                    html_url=pr["html_url"],
                    state=pr["state"],
                    user_login=pr["user"]["login"],
                    created_at=pr["created_at"],
                    updated_at=pr["updated_at"],
                    draft=pr.get("draft", False),
                    head_ref=pr["head"]["ref"],
                    base_ref=pr["base"]["ref"],
                ))
            
            page += 1
            # Limit to first 300 PRs to avoid too long responses
            if len(data) < 100 or len(pull_requests) >= 300:
                break
    
    return GitHubPullRequestsResponse(pull_requests=pull_requests)


@router.get("/repos/{owner}/{repo}/pulls/{pr_number}", response_model=GitHubPRDetails)
async def get_pull_request_details(
    owner: str,
    repo: str,
    pr_number: int,
    db: Session = Depends(get_db)
):
    """Get detailed information about a pull request including the diff."""
    token = get_github_token(db)
    if not token:
        raise HTTPException(status_code=401, detail="GitHub not connected")
    
    async with httpx.AsyncClient() as client:
        # Fetch PR details
        pr_response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json",
            },
            timeout=10.0
        )
        
        if pr_response.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub token expired or invalid")
        
        if pr_response.status_code == 404:
            raise HTTPException(status_code=404, detail="Pull request not found")
        
        if pr_response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch pull request")
        
        pr_data = pr_response.json()
        
        # Fetch the diff
        diff_response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3.diff",
            },
            timeout=30.0
        )
        
        if diff_response.status_code != 200:
            diff_content = "Failed to fetch diff"
        else:
            diff_content = diff_response.text
            # Truncate very large diffs to avoid overwhelming the agent
            max_diff_size = 100000  # ~100KB
            if len(diff_content) > max_diff_size:
                diff_content = diff_content[:max_diff_size] + "\n\n... [diff truncated due to size] ..."
        
        return GitHubPRDetails(
            number=pr_data["number"],
            title=pr_data["title"],
            body=pr_data.get("body"),
            html_url=pr_data["html_url"],
            state=pr_data["state"],
            merged=pr_data.get("merged_at") is not None,
            merged_at=pr_data.get("merged_at"),
            user_login=pr_data["user"]["login"],
            head_ref=pr_data["head"]["ref"],
            base_ref=pr_data["base"]["ref"],
            diff=diff_content,
            additions=pr_data.get("additions", 0),
            deletions=pr_data.get("deletions", 0),
            changed_files=pr_data.get("changed_files", 0),
        )


@router.get("/repos/{owner}/{repo}/pulls/{pr_number}/status", response_model=PRStatusResponse)
async def get_pr_status(
    owner: str,
    repo: str,
    pr_number: int,
    db: Session = Depends(get_db)
):
    """Get lightweight PR status (open/closed/merged)."""
    token = get_github_token(db)
    if not token:
        raise HTTPException(status_code=401, detail="GitHub not connected")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json",
            },
            timeout=10.0
        )
        
        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Pull request not found")
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch PR status")
        
        pr_data = response.json()
        return PRStatusResponse(
            state=pr_data["state"],
            merged=pr_data.get("merged_at") is not None,
            merged_at=pr_data.get("merged_at")
        )


@router.get("/integration/{update_id}/{integration_id}/pr-status", response_model=PRStatusResponse)
async def get_integration_pr_status(
    update_id: str,
    integration_id: str,
    db: Session = Depends(get_db)
):
    """Check PR status for an integration and update database if merged."""
    token = get_github_token(db)
    if not token:
        raise HTTPException(status_code=401, detail="GitHub not connected")
    
    # Get the integration record
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.update_id == update_id,
        UpdateIntegration.integration_id == integration_id
    ).first()
    
    if not ui or not ui.pr_url:
        raise HTTPException(status_code=404, detail="Integration or PR not found")
    
    # Parse PR URL
    import re
    match = re.match(r'https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)', ui.pr_url)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid PR URL format")
    
    owner, repo, pr_number = match.group(1), match.group(2), int(match.group(3))
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json",
            },
            timeout=10.0
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch PR status")
        
        pr_data = response.json()
        merged = pr_data.get("merged_at") is not None
        merged_at = pr_data.get("merged_at")
        
        # Update database if merged (cache the merged status)
        if merged and not ui.pr_merged:
            ui.pr_merged = True
            ui.pr_merged_at = datetime.fromisoformat(merged_at.replace("Z", "+00:00")) if merged_at else None
            ui.status = UpdateIntegrationStatus.COMPLETE.value
            db.commit()
        
        return PRStatusResponse(
            state=pr_data["state"],
            merged=merged,
            merged_at=merged_at
        )


class BranchStatusResponse(BaseModel):
    branch_exists: bool
    pr_url: Optional[str] = None
    pr_number: Optional[int] = None
    pr_state: Optional[str] = None  # open, closed, or merged
    merged: bool = False
    merged_at: Optional[str] = None
    last_commit_sha: Optional[str] = None


def parse_pr_url(pr_url: str) -> tuple[str, str, int] | None:
    """Extract owner, repo, and PR number from a GitHub PR URL."""
    import re
    match = re.match(r'https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)', pr_url)
    if match:
        return match.group(1), match.group(2), int(match.group(3))
    return None


@router.get("/check-branch/{update_id}/{integration_id}", response_model=BranchStatusResponse)
async def check_branch_status(
    update_id: str,
    integration_id: str,
    db: Session = Depends(get_db)
):
    """Check branch and PR status. If we have a stored PR URL, check the PR directly."""
    token = get_github_token(db)
    if not token:
        raise HTTPException(status_code=401, detail="GitHub not connected")
    
    # Get the update integration
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.update_id == update_id,
        UpdateIntegration.integration_id == integration_id
    ).first()
    
    if not ui:
        return BranchStatusResponse(branch_exists=False)
    
    # Get the integration to find the GitHub repo
    integration = db.query(Integration).filter(Integration.id == integration_id).first()
    if not integration or not integration.github_links:
        raise HTTPException(status_code=404, detail="Integration not found or has no GitHub links")
    
    # Parse the GitHub URL
    parsed = parse_github_url(integration.github_links[0])
    if not parsed:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL")
    
    owner, repo = parsed
    
    async with httpx.AsyncClient() as client:
        pr_url = ui.pr_url
        pr_number = None
        pr_state = None
        merged = False
        merged_at = None
        branch_exists = False
        last_commit_sha = None
        
        # If we already have a PR URL, check the PR directly (works even if branch is deleted)
        # But skip if already cached as merged
        if ui.pr_url and not ui.pr_merged:
            pr_parsed = parse_pr_url(ui.pr_url)
            if pr_parsed:
                _, _, pr_number = pr_parsed
                pr_response = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/vnd.github.v3+json",
                    },
                    timeout=10.0
                )
                
                if pr_response.status_code == 200:
                    pr_data = pr_response.json()
                    merged = pr_data.get("merged_at") is not None
                    merged_at = pr_data.get("merged_at")
                    pr_state = "merged" if merged else pr_data["state"]
                    
                    # Update status and cache merged state
                    if merged:
                        ui.pr_merged = True
                        ui.pr_merged_at = datetime.fromisoformat(merged_at.replace("Z", "+00:00")) if merged_at else None
                        ui.status = UpdateIntegrationStatus.COMPLETE.value
                    elif pr_state == "closed":
                        # PR was closed without merging
                        pass  # Keep current status
                    else:
                        ui.status = UpdateIntegrationStatus.READY_TO_MERGE.value
                    db.commit()
        elif ui.pr_merged:
            # Use cached values
            merged = True
            merged_at = ui.pr_merged_at.isoformat() if ui.pr_merged_at else None
            pr_state = "merged"
            if ui.pr_url:
                pr_parsed = parse_pr_url(ui.pr_url)
                if pr_parsed:
                    _, _, pr_number = pr_parsed
        
        # Check branch status (for commit SHA and to discover new PRs)
        if ui.cursor_branch_name:
            branch_response = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/branches/{ui.cursor_branch_name}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github.v3+json",
                },
                timeout=10.0
            )
            
            branch_exists = branch_response.status_code == 200
            
            if branch_exists:
                branch_data = branch_response.json()
                last_commit_sha = branch_data.get("commit", {}).get("sha")
                
                # If we don't have a PR yet, look for one
                if not ui.pr_url:
                    pr_search_response = await client.get(
                        f"https://api.github.com/repos/{owner}/{repo}/pulls",
                        params={"head": f"{owner}:{ui.cursor_branch_name}", "state": "all"},
                        headers={
                            "Authorization": f"Bearer {token}",
                            "Accept": "application/vnd.github.v3+json",
                        },
                        timeout=10.0
                    )
                    
                    if pr_search_response.status_code == 200:
                        prs = pr_search_response.json()
                        if prs:
                            pr_data = prs[0]
                            pr_url = pr_data["html_url"]
                            pr_number = pr_data["number"]
                            merged = pr_data.get("merged_at") is not None
                            merged_at = pr_data.get("merged_at")
                            pr_state = "merged" if merged else pr_data["state"]
                            
                            # Store the PR URL and cache merged state
                            ui.pr_url = pr_url
                            if merged:
                                ui.pr_merged = True
                                ui.pr_merged_at = datetime.fromisoformat(merged_at.replace("Z", "+00:00")) if merged_at else None
                                ui.status = UpdateIntegrationStatus.COMPLETE.value
                            else:
                                ui.status = UpdateIntegrationStatus.READY_TO_MERGE.value
                            db.commit()
        
        return BranchStatusResponse(
            branch_exists=branch_exists,
            pr_url=pr_url,
            pr_number=pr_number,
            pr_state=pr_state,
            merged=merged,
            merged_at=merged_at,
            last_commit_sha=last_commit_sha
        )
