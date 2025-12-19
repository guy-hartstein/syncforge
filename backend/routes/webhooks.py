"""
Webhook endpoints for receiving external service callbacks.
"""

import hmac
import hashlib
import logging
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from database import get_db
from models import UpdateIntegration, UpdateIntegrationStatus, UserSettings
from services.cursor_client import CursorClient, CursorClientError

# Configure logging to output to console
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def verify_cursor_signature(secret: str, raw_body: bytes, signature: str) -> bool:
    """
    Verify the webhook signature from Cursor.
    
    Args:
        secret: The webhook secret
        raw_body: Raw request body bytes
        signature: The X-Webhook-Signature header value
    
    Returns:
        True if signature is valid
    """
    if not signature.startswith("sha256="):
        return False
    
    expected_signature = "sha256=" + hmac.new(
        secret.encode(),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)


@router.post("/cursor")
async def cursor_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receive webhook notifications from Cursor Cloud Agents.
    
    Cursor sends webhooks for statusChange events when agents reach
    FINISHED or ERROR states.
    
    Payload format:
    {
        "event": "statusChange",
        "timestamp": "2024-01-15T10:30:00Z",
        "id": "bc_abc123",
        "status": "FINISHED",
        "source": {
            "repository": "https://github.com/your-org/your-repo",
            "ref": "main"
        },
        "target": {
            "url": "https://cursor.com/agents?id=bc_abc123",
            "branchName": "cursor/add-readme-1234",
            "prUrl": "https://github.com/your-org/your-repo/pull/1234"
        },
        "summary": "Added README.md with installation instructions"
    }
    """
    # Get raw body for signature verification
    raw_body = await request.body()
    
    # Get signature header
    signature = request.headers.get("X-Webhook-Signature", "")
    webhook_id = request.headers.get("X-Webhook-ID", "unknown")
    event_type = request.headers.get("X-Webhook-Event", "")
    
    print(f"[WEBHOOK] Received Cursor webhook: id={webhook_id}, event={event_type}")
    logger.info(f"Received Cursor webhook: id={webhook_id}, event={event_type}")
    
    # Get webhook secret from settings
    settings = db.query(UserSettings).first()
    if not settings or not settings.cursor_webhook_secret:
        print("[WEBHOOK] No secret configured - skipping verification")
        logger.warning("Webhook received but no secret configured - skipping verification")
    elif signature:
        if not verify_cursor_signature(settings.cursor_webhook_secret, raw_body, signature):
            print(f"[WEBHOOK] Invalid signature for webhook {webhook_id}")
            logger.error(f"Invalid webhook signature for webhook {webhook_id}")
            raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Parse payload
    try:
        payload = await request.json()
        print(f"[WEBHOOK] Payload: {payload}")
    except Exception as e:
        print(f"[WEBHOOK] Failed to parse payload: {e}")
        logger.error(f"Failed to parse webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    # Only handle statusChange events
    event = payload.get("event")
    if event != "statusChange":
        print(f"[WEBHOOK] Ignoring non-statusChange event: {event}")
        logger.info(f"Ignoring non-statusChange event: {event}")
        return {"status": "ignored", "reason": f"Unsupported event type: {event}"}
    
    agent_id = payload.get("id")
    status = payload.get("status")
    target = payload.get("target", {})
    summary = payload.get("summary")
    
    print(f"[WEBHOOK] Processing: agent_id={agent_id}, status={status}, target={target}")
    
    if not agent_id:
        print("[WEBHOOK] Missing agent id")
        logger.error("Webhook missing agent id")
        raise HTTPException(status_code=400, detail="Missing agent id")
    
    # Find the UpdateIntegration by cursor_agent_id
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.cursor_agent_id == agent_id
    ).first()
    
    if not ui:
        print(f"[WEBHOOK] No UpdateIntegration found for agent {agent_id}")
        logger.warning(f"No UpdateIntegration found for agent {agent_id}")
        return {"status": "ignored", "reason": "Agent not found in database"}
    
    print(f"[WEBHOOK] Found UpdateIntegration: id={ui.id}, current_status={ui.status}")
    
    # Update based on status
    if status == "FINISHED":
        # Check if PR was created
        pr_url = target.get("prUrl")
        branch_name = target.get("branchName")
        
        ui.status = UpdateIntegrationStatus.READY_TO_MERGE.value
        if pr_url:
            ui.pr_url = pr_url
        if branch_name:
            ui.cursor_branch_name = branch_name
        
        # Clear any pending question
        ui.agent_question = None
        
        print(f"[WEBHOOK] Agent {agent_id} FINISHED. Status -> READY_TO_MERGE, PR: {pr_url}, Branch: {branch_name}")
        logger.info(f"Agent {agent_id} finished. PR: {pr_url}, Branch: {branch_name}")
        
        # Fetch final conversation from Cursor API
        await _fetch_and_cache_conversation(ui, agent_id, settings, db)
        
    elif status == "ERROR":
        ui.status = UpdateIntegrationStatus.NEEDS_REVIEW.value
        ui.agent_question = f"Agent error: {summary or 'Unknown error'}"
        print(f"[WEBHOOK] Agent {agent_id} ERROR: {summary}")
        logger.error(f"Agent {agent_id} errored: {summary}")
        
        # Also fetch conversation on error to show what happened
        await _fetch_and_cache_conversation(ui, agent_id, settings, db)
    
    else:
        print(f"[WEBHOOK] Unhandled status for agent {agent_id}: {status}")
        logger.info(f"Unhandled status for agent {agent_id}: {status}")
        return {"status": "ignored", "reason": f"Unhandled status: {status}"}
    
    ui.updated_at = datetime.utcnow()
    db.commit()
    
    print(f"[WEBHOOK] Successfully updated agent {agent_id} to status {ui.status}")
    
    return {
        "status": "processed",
        "agent_id": agent_id,
        "new_status": ui.status
    }


async def _fetch_and_cache_conversation(
    ui: UpdateIntegration, 
    agent_id: str, 
    settings: UserSettings,
    db: Session
) -> None:
    """Fetch the latest conversation from Cursor API and cache it."""
    if not settings or not settings.cursor_api_key:
        print("[WEBHOOK] No Cursor API key configured, skipping conversation fetch")
        return
    
    try:
        async with CursorClient(settings.cursor_api_key) as client:
            conversation = await client.get_conversation(agent_id)
            agent_info = await client.get_agent_status(agent_id)
        
        # Update conversation cache
        ui.conversation = [
            {"id": msg.id, "type": msg.type, "text": msg.text}
            for msg in conversation
        ]
        flag_modified(ui, "conversation")
        
        # Also update branch/PR info from agent status if not already set
        if agent_info.branch_name and not ui.cursor_branch_name:
            ui.cursor_branch_name = agent_info.branch_name
        if agent_info.pr_url and not ui.pr_url:
            ui.pr_url = agent_info.pr_url
        
        print(f"[WEBHOOK] Fetched conversation ({len(conversation)} messages) for agent {agent_id}")
        
    except CursorClientError as e:
        print(f"[WEBHOOK] Failed to fetch conversation for agent {agent_id}: {e}")
        logger.warning(f"Failed to fetch conversation for agent {agent_id}: {e}")

