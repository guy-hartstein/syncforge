from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from typing import Dict
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from sqlalchemy.orm import Session
import uuid
import os
import aiofiles
import httpx

from database import get_db
from models import UserSettings
from schemas import (
    ChatRequest, ChatResponse, WizardSession, WizardStartResponse,
    ChatMessage, Attachment, AttachmentUrlRequest, AttachmentPRRequest, WizardConfigRequest
)
from agents.update_agent import get_update_agent

router = APIRouter(prefix="/api/wizard", tags=["wizard"])

# In-memory session storage (in production, use Redis or database)
sessions: Dict[str, dict] = {}

# Upload directory
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/start", response_model=WizardStartResponse)
async def start_wizard():
    """Start a new wizard session."""
    session_id = str(uuid.uuid4())
    agent = get_update_agent()
    initial_message = agent.get_initial_message()
    
    sessions[session_id] = {
        "id": session_id,
        "messages": [{"role": "assistant", "content": initial_message}],
        "attachments": [],
        "selected_integrations": [],
        "integration_configs": {},
        "clarification_count": 0,
        "ready_to_proceed": False,
        "created_at": datetime.utcnow()
    }
    
    return WizardStartResponse(
        session_id=session_id,
        initial_message=initial_message
    )


@router.get("/{session_id}", response_model=WizardSession)
async def get_session(session_id: str):
    """Get the current wizard session state."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    return WizardSession(
        id=session["id"],
        messages=[ChatMessage(**m) for m in session["messages"]],
        attachments=[Attachment(**a) for a in session["attachments"]],
        selected_integrations=session["selected_integrations"],
        integration_configs=session["integration_configs"],
        clarification_count=session["clarification_count"],
        ready_to_proceed=session["ready_to_proceed"],
        created_at=session["created_at"]
    )


@router.post("/{session_id}/chat", response_model=ChatResponse)
async def chat(session_id: str, request: ChatRequest):
    """Send a message and get AI response."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    
    # Add user message
    session["messages"].append({"role": "user", "content": request.message})
    
    # Build attachment context if there are attachments with content
    attachment_context = ""
    attachments = session.get("attachments", [])
    if attachments:
        attachment_parts = []
        for att in attachments:
            if att.get("content"):
                # PR or other content-rich attachment
                attachment_parts.append(f"### {att['name']}\n{att['content']}")
            elif att.get("url"):
                # URL attachment
                attachment_parts.append(f"- [{att['name']}]({att['url']})")
        
        if attachment_parts:
            attachment_context = "\n\n---\n**ATTACHED REFERENCES:**\n" + "\n\n".join(attachment_parts) + "\n---\n"
    
    # Convert to LangChain messages
    lc_messages = []
    for i, msg in enumerate(session["messages"]):
        content = msg["content"]
        # Inject attachment context with the first user message
        if i == 0 and msg["role"] == "user" and attachment_context:
            content = content + attachment_context
        # Also inject if attachments were just added (last user message)
        elif i == len(session["messages"]) - 1 and msg["role"] == "user" and attachment_context:
            # Check if this message doesn't already have attachment context
            if "ATTACHED REFERENCES:" not in content:
                content = content + attachment_context
        
        if msg["role"] == "user":
            lc_messages.append(HumanMessage(content=content))
        else:
            lc_messages.append(AIMessage(content=content))
    
    # Get agent response
    agent = get_update_agent()
    result = agent.chat(lc_messages, session["clarification_count"], attachments)
    
    # Update session
    session["messages"].append({"role": "assistant", "content": result["response"]})
    session["clarification_count"] = result["clarification_count"]
    session["ready_to_proceed"] = result["ready_to_proceed"]
    
    return ChatResponse(
        response=result["response"],
        ready_to_proceed=result["ready_to_proceed"]
    )


@router.post("/{session_id}/attachments/file")
async def upload_file(session_id: str, file: UploadFile = File(...)):
    """Upload a file attachment."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Create session upload directory
    session_upload_dir = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_upload_dir, exist_ok=True)
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
    file_path = os.path.join(session_upload_dir, f"{file_id}{file_ext}")
    
    # Save file
    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)
    
    # Add to session
    attachment = {
        "id": file_id,
        "type": "file",
        "name": file.filename or "unnamed",
        "file_path": file_path,
        "url": None
    }
    sessions[session_id]["attachments"].append(attachment)
    
    return Attachment(**attachment)


@router.post("/{session_id}/attachments/url")
async def add_url(session_id: str, request: AttachmentUrlRequest):
    """Add a URL attachment (PR link, documentation, etc.)."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Auto-generate name from URL if not provided
    name = request.name
    if not name:
        # Extract repo/PR info from GitHub URLs
        if "github.com" in request.url:
            parts = request.url.replace("https://github.com/", "").split("/")
            if len(parts) >= 4 and parts[2] == "pull":
                name = f"PR #{parts[3]} - {parts[0]}/{parts[1]}"
            elif len(parts) >= 2:
                name = f"{parts[0]}/{parts[1]}"
            else:
                name = request.url
        else:
            name = request.url
    
    attachment = {
        "id": str(uuid.uuid4()),
        "type": "url",
        "name": name,
        "url": request.url,
        "file_path": None
    }
    sessions[session_id]["attachments"].append(attachment)
    
    return Attachment(**attachment)


@router.post("/{session_id}/attachments/pr")
async def add_pr_attachment(session_id: str, request: AttachmentPRRequest, db: Session = Depends(get_db)):
    """Add a GitHub PR attachment with its diff content."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get GitHub token
    settings = db.query(UserSettings).first()
    if not settings or not settings.github_pat:
        raise HTTPException(status_code=401, detail="GitHub not connected")
    
    token = settings.github_pat
    
    # Fetch PR details and diff
    async with httpx.AsyncClient() as client:
        # Fetch PR details
        pr_response = await client.get(
            f"https://api.github.com/repos/{request.owner}/{request.repo}/pulls/{request.pr_number}",
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
            f"https://api.github.com/repos/{request.owner}/{request.repo}/pulls/{request.pr_number}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3.diff",
            },
            timeout=30.0
        )
        
        diff_content = ""
        if diff_response.status_code == 200:
            diff_content = diff_response.text
            # Truncate very large diffs
            max_diff_size = 100000
            if len(diff_content) > max_diff_size:
                diff_content = diff_content[:max_diff_size] + "\n\n... [diff truncated due to size] ..."
    
    # Build comprehensive PR content for the agent
    pr_body = pr_data.get("body") or "No description provided."
    content = f"""## Pull Request #{request.pr_number}: {pr_data['title']}

**Repository:** {request.owner}/{request.repo}
**Branch:** {pr_data['head']['ref']} → {pr_data['base']['ref']}
**Author:** {pr_data['user']['login']}
**Status:** {pr_data['state']}
**Changes:** +{pr_data.get('additions', 0)} -{pr_data.get('deletions', 0)} in {pr_data.get('changed_files', 0)} files

### Description
{pr_body}

### Diff
```diff
{diff_content}
```
"""
    
    attachment = {
        "id": str(uuid.uuid4()),
        "type": "github_pr",
        "name": f"PR #{request.pr_number}: {request.title}",
        "url": request.url,
        "file_path": None,
        "content": content
    }
    sessions[session_id]["attachments"].append(attachment)
    
    return Attachment(**attachment)


@router.delete("/{session_id}/attachments/{attachment_id}")
async def remove_attachment(session_id: str, attachment_id: str):
    """Remove an attachment."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    attachment = next((a for a in session["attachments"] if a["id"] == attachment_id), None)
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Delete file if it exists
    if attachment["file_path"] and os.path.exists(attachment["file_path"]):
        os.remove(attachment["file_path"])
    
    # Remove from session
    session["attachments"] = [a for a in session["attachments"] if a["id"] != attachment_id]
    
    return {"success": True}


@router.post("/{session_id}/config")
async def update_config(session_id: str, request: WizardConfigRequest):
    """Update wizard configuration (selected integrations and custom instructions)."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    session["selected_integrations"] = request.selected_integrations
    session["integration_configs"] = request.integration_configs
    
    return {"success": True}


@router.post("/{session_id}/submit")
async def submit_wizard(session_id: str):
    """Submit the wizard and create an update."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    agent = get_update_agent()
    
    # Generate title from conversation
    title = agent.generate_title(session["messages"])
    
    # Generate implementation guide
    implementation_guide = agent.generate_implementation_guide(
        session["messages"],
        session["attachments"]
    )
    
    # Create description from last AI summary
    description = ""
    for msg in reversed(session["messages"]):
        if msg["role"] == "assistant":
            description = msg["content"]
            break
    
    # Return data for frontend to create the update
    return {
        "title": title,
        "description": description,
        "implementation_guide": implementation_guide,
        "selected_integrations": session["selected_integrations"],
        "integration_configs": session["integration_configs"],
        "attachments": session["attachments"]
    }


