"""
Agent API Endpoints - Manage Cursor Cloud Agents for integration updates.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import Update, UpdateIntegration, Integration, UserSettings
from schemas import (
    AgentConversationResponse,
    AgentConversationMessage,
    FollowupRequest,
    StartAgentsResponse
)
from services.cursor_client import CursorClient, CursorClientError
from services.agent_orchestrator import AgentOrchestrator

router = APIRouter(prefix="/api/updates", tags=["agents"])


def get_api_key(db: Session) -> str:
    """Get Cursor API key from user settings."""
    settings = db.query(UserSettings).first()
    if not settings or not settings.cursor_api_key:
        raise HTTPException(
            status_code=400,
            detail="Cursor API key not configured. Please add your API key in Settings."
        )
    return settings.cursor_api_key


@router.post("/{update_id}/start-agents", response_model=StartAgentsResponse)
async def start_agents(update_id: str, db: Session = Depends(get_db)):
    """
    Start Cursor agents for all integrations in an update.
    """
    api_key = get_api_key(db)
    
    update = db.query(Update).filter(Update.id == update_id).first()
    if not update:
        raise HTTPException(status_code=404, detail="Update not found")
    
    orchestrator = AgentOrchestrator(api_key)
    
    try:
        agent_ids = await orchestrator.start_all_agents(update_id, api_key, db)
        return StartAgentsResponse(
            started=len(agent_ids),
            agent_ids=agent_ids
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{update_id}/integrations/{integration_id}/conversation", response_model=AgentConversationResponse)
async def get_conversation(
    update_id: str,
    integration_id: str,
    db: Session = Depends(get_db)
):
    """
    Get the conversation history for an integration's agent.
    """
    api_key = get_api_key(db)
    
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.update_id == update_id,
        UpdateIntegration.integration_id == integration_id
    ).first()
    
    if not ui:
        raise HTTPException(status_code=404, detail="Update integration not found")
    
    # Return cached conversation if no agent
    if not ui.cursor_agent_id:
        return AgentConversationResponse(
            messages=[],
            status=ui.status,
            agent_id=None,
            branch_name=ui.cursor_branch_name,
            pr_url=ui.pr_url
        )
    
    # Fetch latest from Cursor API
    try:
        async with CursorClient(api_key) as client:
            conversation = await client.get_conversation(ui.cursor_agent_id)
            agent_info = await client.get_agent_status(ui.cursor_agent_id)
        
        messages = [
            AgentConversationMessage(
                id=msg.id,
                type=msg.type,
                text=msg.text
            )
            for msg in conversation
        ]
        
        return AgentConversationResponse(
            messages=messages,
            status=ui.status,
            agent_id=ui.cursor_agent_id,
            branch_name=agent_info.branch_name,
            pr_url=agent_info.pr_url
        )
        
    except CursorClientError as e:
        # Return cached data on error
        cached_messages = [
            AgentConversationMessage(**msg)
            for msg in (ui.conversation or [])
        ]
        return AgentConversationResponse(
            messages=cached_messages,
            status=ui.status,
            agent_id=ui.cursor_agent_id,
            branch_name=ui.cursor_branch_name,
            pr_url=ui.pr_url
        )


@router.post("/{update_id}/integrations/{integration_id}/followup")
async def send_followup(
    update_id: str,
    integration_id: str,
    request: FollowupRequest,
    db: Session = Depends(get_db)
):
    """
    Send a follow-up message to an integration's agent.
    """
    api_key = get_api_key(db)
    
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.update_id == update_id,
        UpdateIntegration.integration_id == integration_id
    ).first()
    
    if not ui:
        raise HTTPException(status_code=404, detail="Update integration not found")
    
    if not ui.cursor_agent_id:
        raise HTTPException(status_code=400, detail="No agent running for this integration")
    
    orchestrator = AgentOrchestrator(api_key)
    
    success = await orchestrator.send_followup(ui.id, request.text, api_key, db)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send follow-up")
    
    return {"success": True}


@router.post("/{update_id}/integrations/{integration_id}/stop")
async def stop_agent(
    update_id: str,
    integration_id: str,
    db: Session = Depends(get_db)
):
    """
    Stop an integration's running agent.
    """
    api_key = get_api_key(db)
    
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.update_id == update_id,
        UpdateIntegration.integration_id == integration_id
    ).first()
    
    if not ui:
        raise HTTPException(status_code=404, detail="Update integration not found")
    
    if not ui.cursor_agent_id:
        raise HTTPException(status_code=400, detail="No agent running for this integration")
    
    orchestrator = AgentOrchestrator(api_key)
    
    success = await orchestrator.stop_agent(ui.id, api_key, db)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to stop agent")
    
    return {"success": True}


@router.post("/{update_id}/sync")
async def sync_agents(update_id: str, db: Session = Depends(get_db)):
    """
    Sync status of all agents for an update from Cursor API.
    """
    api_key = get_api_key(db)
    
    update = db.query(Update).filter(Update.id == update_id).first()
    if not update:
        raise HTTPException(status_code=404, detail="Update not found")
    
    orchestrator = AgentOrchestrator(api_key)
    
    result = await orchestrator.sync_all_agents(update_id, api_key, db)
    
    return result


@router.patch("/{update_id}/integrations/{integration_id}/settings")
async def update_integration_settings(
    update_id: str,
    integration_id: str,
    auto_create_pr: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """
    Update settings for a specific integration within an update.
    """
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.update_id == update_id,
        UpdateIntegration.integration_id == integration_id
    ).first()
    
    if not ui:
        raise HTTPException(status_code=404, detail="Update integration not found")
    
    if auto_create_pr is not None:
        ui.auto_create_pr = auto_create_pr
    
    db.commit()
    
    return {"success": True, "auto_create_pr": ui.auto_create_pr}

