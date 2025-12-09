from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

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
    
    # Handle various GitHub URL formats
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
        # Remove .git suffix if present
        repo = repo.removesuffix(".git")
        return owner, repo
    return None


@router.post("/check-repo", response_model=RepoCheckResponse)
async def check_repo(request: RepoCheckRequest):
    """Check if a GitHub repository is public and accessible."""
    parsed = parse_github_url(request.url)
    
    if not parsed:
        return RepoCheckResponse(
            is_valid=False,
            is_public=False,
            error="Invalid GitHub URL format"
        )
    
    owner, repo = parsed
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                api_url,
                headers={"Accept": "application/vnd.github.v3+json"},
                timeout=5.0
            )
            
            if response.status_code == 200:
                data = response.json()
                return RepoCheckResponse(
                    is_valid=True,
                    is_public=not data.get("private", True),
                    repo_name=data.get("full_name")
                )
            elif response.status_code == 404:
                # Could be private or doesn't exist
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

