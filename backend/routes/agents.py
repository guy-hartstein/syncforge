"""
Agent API Endpoints - Manage Cursor Cloud Agents for integration updates.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import uuid
import logging

from database import get_db, SessionLocal
from models import Update, UpdateIntegration, Integration, UserSettings
from schemas import (
    AgentConversationResponse,
    AgentConversationMessage,
    FollowupRequest,
    StartAgentsResponse
)
from services.cursor_client import CursorClient, CursorClientError
from services.agent_orchestrator import AgentOrchestrator
from agents.update_agent import get_update_agent

logger = logging.getLogger(__name__)

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


def get_preferred_model(db: Session) -> Optional[str]:
    """Get preferred model from user settings."""
    settings = db.query(UserSettings).first()
    return settings.preferred_model if settings else None


@router.post("/{update_id}/start-agents", response_model=StartAgentsResponse)
async def start_agents(update_id: str, db: Session = Depends(get_db)):
    """
    Start Cursor agents for all integrations in an update.
    """
    api_key = get_api_key(db)
    preferred_model = get_preferred_model(db)
    
    update = db.query(Update).filter(Update.id == update_id).first()
    if not update:
        raise HTTPException(status_code=404, detail="Update not found")
    
    orchestrator = AgentOrchestrator(api_key)
    
    try:
        agent_ids = await orchestrator.start_all_agents(update_id, api_key, db, model=preferred_model)
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
    Get the cached conversation history for an integration's agent.
    Uses cached data to reduce API calls. Use POST .../conversation/refresh for fresh data.
    """
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.update_id == update_id,
        UpdateIntegration.integration_id == integration_id
    ).first()
    
    if not ui:
        raise HTTPException(status_code=404, detail="Update integration not found")
    
    # Return cached conversation (no API call)
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


@router.post("/{update_id}/integrations/{integration_id}/conversation/refresh", response_model=AgentConversationResponse)
async def refresh_conversation(
    update_id: str,
    integration_id: str,
    db: Session = Depends(get_db)
):
    """
    Fetch fresh conversation from Cursor API and update cache.
    Use this when user explicitly wants to see latest conversation.
    """
    api_key = get_api_key(db)
    
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.update_id == update_id,
        UpdateIntegration.integration_id == integration_id
    ).first()
    
    if not ui:
        raise HTTPException(status_code=404, detail="Update integration not found")
    
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
        
        # Update cache
        from sqlalchemy.orm.attributes import flag_modified
        ui.conversation = [
            {"id": msg.id, "type": msg.type, "text": msg.text}
            for msg in conversation
        ]
        flag_modified(ui, "conversation")
        
        # Update status info as well
        if agent_info.branch_name:
            ui.cursor_branch_name = agent_info.branch_name
        if agent_info.pr_url:
            ui.pr_url = agent_info.pr_url
        
        db.commit()
        
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
            branch_name=agent_info.branch_name or ui.cursor_branch_name,
            pr_url=agent_info.pr_url or ui.pr_url
        )
        
    except CursorClientError as e:
        logger.error(f"Failed to refresh conversation: {e}")
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


def extract_and_save_memory(integration_id: str, user_message: str, conversation_context: list):
    """
    Background task to extract and save memories from user messages.
    Runs asynchronously to avoid adding latency to the followup response.
    """
    db = SessionLocal()
    try:
        agent = get_update_agent()
        
        # Build context from recent conversation
        context = ""
        if conversation_context:
            recent_msgs = conversation_context[-4:]  # Last 4 messages for context
            context = "\n".join([f"{m.get('type', 'unknown')}: {m.get('text', '')}" for m in recent_msgs])
        
        extracted_memory = agent.extract_memory(user_message, context)
        
        if extracted_memory:
            integration = db.query(Integration).filter(Integration.id == integration_id).first()
            if integration:
                memory_id = str(uuid.uuid4())
                memory_data = {
                    "id": memory_id,
                    "content": extracted_memory,
                    "created_at": datetime.utcnow().isoformat()
                }
                
                memories = integration.memories or []
                memories.append(memory_data)
                integration.memories = memories
                db.commit()
                logger.info(f"Memory saved for integration {integration_id}: {extracted_memory[:50]}...")
    except Exception as e:
        logger.error(f"Failed to extract/save memory: {e}")
    finally:
        db.close()


@router.post("/{update_id}/integrations/{integration_id}/followup")
async def send_followup(
    update_id: str,
    integration_id: str,
    request: FollowupRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Send a follow-up message to an integration's agent.
    Memory extraction runs in the background to avoid latency.
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
    
    # Fire off memory extraction as a background task (no latency impact)
    conversation_context = ui.conversation or []
    background_tasks.add_task(
        extract_and_save_memory,
        integration_id,
        request.text,
        conversation_context
    )
    
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

