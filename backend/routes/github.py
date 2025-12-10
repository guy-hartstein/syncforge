from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx

from database import get_db
from models import UserSettings
from schemas import GitHubPATRequest, GitHubRepo, GitHubReposResponse

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
