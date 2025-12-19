"""
Webhook endpoints for receiving external service callbacks.
"""

import hmac
import hashlib
import logging
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import UpdateIntegration, UpdateIntegrationStatus, UserSettings

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
    
    logger.info(f"Received Cursor webhook: id={webhook_id}, event={event_type}")
    
    # Get webhook secret from settings
    settings = db.query(UserSettings).first()
    if not settings or not settings.cursor_webhook_secret:
        logger.warning("Webhook received but no secret configured - skipping verification")
    elif signature:
        if not verify_cursor_signature(settings.cursor_webhook_secret, raw_body, signature):
            logger.error(f"Invalid webhook signature for webhook {webhook_id}")
            raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Parse payload
    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    # Only handle statusChange events
    event = payload.get("event")
    if event != "statusChange":
        logger.info(f"Ignoring non-statusChange event: {event}")
        return {"status": "ignored", "reason": f"Unsupported event type: {event}"}
    
    agent_id = payload.get("id")
    status = payload.get("status")
    target = payload.get("target", {})
    summary = payload.get("summary")
    
    if not agent_id:
        logger.error("Webhook missing agent id")
        raise HTTPException(status_code=400, detail="Missing agent id")
    
    # Find the UpdateIntegration by cursor_agent_id
    ui = db.query(UpdateIntegration).filter(
        UpdateIntegration.cursor_agent_id == agent_id
    ).first()
    
    if not ui:
        logger.warning(f"No UpdateIntegration found for agent {agent_id}")
        return {"status": "ignored", "reason": "Agent not found in database"}
    
    # Update based on status
    if status == "FINISHED":
        # Check if PR was created
        pr_url = target.get("prUrl")
        branch_name = target.get("branchName")
        
        if pr_url:
            ui.pr_url = pr_url
            ui.status = UpdateIntegrationStatus.READY_TO_MERGE.value
        else:
            ui.status = UpdateIntegrationStatus.READY_TO_MERGE.value
        
        if branch_name:
            ui.cursor_branch_name = branch_name
        
        if summary:
            # Store summary as the last message context
            ui.agent_question = None  # Clear any pending question
        
        logger.info(f"Agent {agent_id} finished. PR: {pr_url}, Branch: {branch_name}")
        
    elif status == "ERROR":
        ui.status = UpdateIntegrationStatus.NEEDS_REVIEW.value
        ui.agent_question = f"Agent error: {summary or 'Unknown error'}"
        logger.error(f"Agent {agent_id} errored: {summary}")
    
    else:
        logger.info(f"Unhandled status for agent {agent_id}: {status}")
        return {"status": "ignored", "reason": f"Unhandled status: {status}"}
    
    ui.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "status": "processed",
        "agent_id": agent_id,
        "new_status": ui.status
    }

