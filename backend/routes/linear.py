from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List
import httpx

from database import get_db
from models import UserSettings


class LinearTeam(BaseModel):
    id: str
    name: str
    key: str


class LinearIssue(BaseModel):
    id: str
    identifier: str
    title: str
    description: Optional[str] = None
    url: str
    state_name: str
    priority: int
    assignee_name: Optional[str] = None
    created_at: str
    updated_at: str


class LinearTeamsResponse(BaseModel):
    teams: List[LinearTeam]


class LinearIssuesResponse(BaseModel):
    issues: List[LinearIssue]


class LinearIssueDetails(BaseModel):
    id: str
    identifier: str
    title: str
    description: Optional[str] = None
    url: str
    state_name: str
    priority: int
    priority_label: str
    assignee_name: Optional[str] = None
    team_name: str
    labels: List[str]
    created_at: str
    updated_at: str


class LinearAPIKeyRequest(BaseModel):
    api_key: str


router = APIRouter(prefix="/api/linear", tags=["linear"])


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


def get_linear_token(db: Session) -> str | None:
    """Get the stored Linear API key."""
    settings = get_user_settings(db)
    if settings:
        return settings.linear_api_key
    return None


async def linear_graphql_request(token: str, query: str, variables: dict = None) -> dict:
    """Make a GraphQL request to the Linear API."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.linear.app/graphql",
            json={"query": query, "variables": variables or {}},
            headers={
                "Authorization": token,
                "Content-Type": "application/json",
            },
            timeout=15.0
        )
        
        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid Linear API key")
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Linear API request failed")
        
        data = response.json()
        if "errors" in data:
            raise HTTPException(status_code=400, detail=data["errors"][0].get("message", "GraphQL error"))
        
        return data.get("data", {})


@router.post("/token")
async def save_linear_token(request: LinearAPIKeyRequest, db: Session = Depends(get_db)):
    """Save Linear API key and validate it."""
    # Validate the token by fetching user info
    query = """
        query {
            viewer {
                id
                name
                email
            }
        }
    """
    
    try:
        data = await linear_graphql_request(request.api_key, query)
        viewer = data.get("viewer", {})
    except HTTPException as e:
        if e.status_code == 401:
            raise HTTPException(status_code=400, detail="Invalid API key")
        raise
    
    # Save token
    settings = get_or_create_settings(db)
    settings.linear_api_key = request.api_key
    db.commit()
    
    return {"success": True, "name": viewer.get("name"), "email": viewer.get("email")}


@router.delete("/token")
async def delete_linear_token(db: Session = Depends(get_db)):
    """Delete Linear API key and disconnect."""
    settings = get_user_settings(db)
    if settings:
        settings.linear_api_key = None
        db.commit()
    return {"success": True}


@router.get("/status")
async def linear_status(db: Session = Depends(get_db)):
    """Check if Linear is connected."""
    settings = get_user_settings(db)
    
    return {
        "connected": bool(settings and settings.linear_api_key),
    }


@router.get("/teams", response_model=LinearTeamsResponse)
async def list_teams(db: Session = Depends(get_db)):
    """List teams accessible to the authenticated user."""
    token = get_linear_token(db)
    if not token:
        raise HTTPException(status_code=401, detail="Linear not connected")
    
    query = """
        query {
            teams {
                nodes {
                    id
                    name
                    key
                }
            }
        }
    """
    
    data = await linear_graphql_request(token, query)
    teams = data.get("teams", {}).get("nodes", [])
    
    return LinearTeamsResponse(
        teams=[
            LinearTeam(
                id=team["id"],
                name=team["name"],
                key=team["key"]
            )
            for team in teams
        ]
    )


@router.get("/teams/{team_id}/issues", response_model=LinearIssuesResponse)
async def list_team_issues(
    team_id: str,
    state: str = "active",
    db: Session = Depends(get_db)
):
    """List issues for a team."""
    token = get_linear_token(db)
    if not token:
        raise HTTPException(status_code=401, detail="Linear not connected")
    
    # Build state filter
    state_filter = ""
    if state == "active":
        state_filter = 'filter: { state: { type: { nin: ["completed", "canceled"] } } }'
    elif state == "completed":
        state_filter = 'filter: { state: { type: { eq: "completed" } } }'
    elif state == "canceled":
        state_filter = 'filter: { state: { type: { eq: "canceled" } } }'
    # "all" = no filter
    
    query = f"""
        query($teamId: String!) {{
            team(id: $teamId) {{
                issues(first: 100, orderBy: updatedAt, {state_filter}) {{
                    nodes {{
                        id
                        identifier
                        title
                        description
                        url
                        state {{
                            name
                        }}
                        priority
                        assignee {{
                            name
                        }}
                        createdAt
                        updatedAt
                    }}
                }}
            }}
        }}
    """
    
    data = await linear_graphql_request(token, query, {"teamId": team_id})
    issues = data.get("team", {}).get("issues", {}).get("nodes", [])
    
    return LinearIssuesResponse(
        issues=[
            LinearIssue(
                id=issue["id"],
                identifier=issue["identifier"],
                title=issue["title"],
                description=issue.get("description"),
                url=issue["url"],
                state_name=issue.get("state", {}).get("name", "Unknown"),
                priority=issue.get("priority", 0),
                assignee_name=issue.get("assignee", {}).get("name") if issue.get("assignee") else None,
                created_at=issue["createdAt"],
                updated_at=issue["updatedAt"]
            )
            for issue in issues
        ]
    )


@router.get("/issues/{issue_id}", response_model=LinearIssueDetails)
async def get_issue_details(issue_id: str, db: Session = Depends(get_db)):
    """Get detailed information about an issue."""
    token = get_linear_token(db)
    if not token:
        raise HTTPException(status_code=401, detail="Linear not connected")
    
    query = """
        query($issueId: String!) {
            issue(id: $issueId) {
                id
                identifier
                title
                description
                url
                state {
                    name
                }
                priority
                priorityLabel
                assignee {
                    name
                }
                team {
                    name
                }
                labels {
                    nodes {
                        name
                    }
                }
                createdAt
                updatedAt
            }
        }
    """
    
    data = await linear_graphql_request(token, query, {"issueId": issue_id})
    issue = data.get("issue")
    
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    return LinearIssueDetails(
        id=issue["id"],
        identifier=issue["identifier"],
        title=issue["title"],
        description=issue.get("description"),
        url=issue["url"],
        state_name=issue.get("state", {}).get("name", "Unknown"),
        priority=issue.get("priority", 0),
        priority_label=issue.get("priorityLabel", "No priority"),
        assignee_name=issue.get("assignee", {}).get("name") if issue.get("assignee") else None,
        team_name=issue.get("team", {}).get("name", "Unknown"),
        labels=[label["name"] for label in issue.get("labels", {}).get("nodes", [])],
        created_at=issue["createdAt"],
        updated_at=issue["updatedAt"]
    )
