from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import Dict
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
import uuid
import os
import aiofiles

from schemas import (
    ChatRequest, ChatResponse, WizardSession, WizardStartResponse,
    ChatMessage, Attachment, AttachmentUrlRequest, WizardConfigRequest
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
    
    # Convert to LangChain messages
    lc_messages = []
    for msg in session["messages"]:
        if msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
        else:
            lc_messages.append(AIMessage(content=msg["content"]))
    
    # Get agent response
    agent = get_update_agent()
    result = agent.chat(lc_messages, session["clarification_count"])
    
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

