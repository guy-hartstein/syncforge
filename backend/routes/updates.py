from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from database import get_db, SessionLocal
from models import Update, UpdateIntegration, Integration, UpdateStatus
from schemas import (
    UpdateCreate, UpdateResponse, UpdateListResponse,
    UpdateIntegrationResponse, UpdateIntegrationStatusUpdate
)
from agents.update_agent import get_update_agent

router = APIRouter(prefix="/api/updates", tags=["updates"])


def get_integration_statuses_with_names(db: Session, update: Update) -> List[UpdateIntegrationResponse]:
    """Get integration statuses with integration names."""
    result = []
    for ui in update.integration_statuses:
        integration = db.query(Integration).filter(Integration.id == ui.integration_id).first()
        # Get the first GitHub link for branch URL construction
        github_url = None
        if integration and integration.github_links:
            github_url = integration.github_links[0]
        result.append(UpdateIntegrationResponse(
            id=ui.id,
            update_id=ui.update_id,
            integration_id=ui.integration_id,
            integration_name=integration.name if integration else None,
            github_url=github_url,
            status=ui.status,
            pr_url=ui.pr_url,
            agent_question=ui.agent_question,
            custom_instructions=ui.custom_instructions,
            cursor_agent_id=ui.cursor_agent_id,
            cursor_branch_name=ui.cursor_branch_name,
            conversation=ui.conversation or [],
            auto_create_pr=ui.auto_create_pr,
            created_at=ui.created_at,
            updated_at=ui.updated_at
        ))
    return result


@router.get("", response_model=List[UpdateListResponse])
def list_updates(db: Session = Depends(get_db)):
    """List all updates with their integration statuses."""
    updates = db.query(Update).order_by(Update.created_at.desc()).all()
    result = []
    for update in updates:
        result.append(UpdateListResponse(
            id=update.id,
            title=update.title,
            status=update.status,
            selected_integration_ids=update.selected_integration_ids or [],
            auto_create_pr=update.auto_create_pr or False,
            integration_statuses=get_integration_statuses_with_names(db, update),
            created_at=update.created_at,
            updated_at=update.updated_at
        ))
    return result


def generate_update_content(update_id: str, messages: list, attachments: list):
    """Background task to generate title and implementation guide."""
    db = SessionLocal()
    try:
        update = db.query(Update).filter(Update.id == update_id).first()
        if not update:
            return
        
        agent = get_update_agent()
        
        # Generate title
        title = agent.generate_title(messages)
        
        # Generate implementation guide
        implementation_guide = agent.generate_implementation_guide(messages, attachments)
        
        # Get description from last AI message
        description = ""
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                description = msg.get("content", "")
                break
        
        # Update the record
        update.title = title
        update.description = description
        update.implementation_guide = implementation_guide
        update.status = UpdateStatus.IN_PROGRESS.value
        
        db.commit()
    finally:
        db.close()


@router.post("", response_model=UpdateResponse, status_code=201)
def create_update(
    update_data: UpdateCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Create a new update and its integration statuses."""
    # Check if this is a quick create (has messages for background processing)
    is_quick_create = bool(update_data.messages)
    
    # Create the update with "creating" status if quick create
    db_update = Update(
        title=update_data.title or "Creating update...",
        description=update_data.description,
        implementation_guide=update_data.implementation_guide,
        status=UpdateStatus.CREATING.value if is_quick_create else UpdateStatus.IN_PROGRESS.value,
        selected_integration_ids=update_data.selected_integration_ids,
        attachments=[a.dict() if hasattr(a, 'dict') else a for a in (update_data.attachments or [])],
        auto_create_pr=update_data.auto_create_pr or False
    )
    db.add(db_update)
    db.flush()  # Get the ID
    
    # Determine which integrations to include
    if update_data.selected_integration_ids:
        integration_ids = update_data.selected_integration_ids
    else:
        # All integrations
        integrations = db.query(Integration).all()
        integration_ids = [i.id for i in integrations]
    
    # Create UpdateIntegration records for each
    for integration_id in integration_ids:
        custom_instructions = update_data.integration_configs.get(integration_id, "")
        db_update_integration = UpdateIntegration(
            update_id=db_update.id,
            integration_id=integration_id,
            custom_instructions=custom_instructions,
            auto_create_pr=update_data.auto_create_pr or False  # Inherit from update-level setting
        )
        db.add(db_update_integration)
    
    db.commit()
    db.refresh(db_update)
    
    # Schedule background task to generate title and guide
    if is_quick_create and update_data.messages:
        background_tasks.add_task(
            generate_update_content,
            db_update.id,
            update_data.messages,
            update_data.attachments or []
        )
    
    return UpdateResponse(
        id=db_update.id,
        title=db_update.title,
        description=db_update.description,
        implementation_guide=db_update.implementation_guide,
        status=db_update.status,
        selected_integration_ids=db_update.selected_integration_ids or [],
        attachments=db_update.attachments or [],
        auto_create_pr=db_update.auto_create_pr or False,
        integration_statuses=get_integration_statuses_with_names(db, db_update),
        created_at=db_update.created_at,
        updated_at=db_update.updated_at
    )


@router.get("/{update_id}", response_model=UpdateResponse)
def get_update(update_id: str, db: Session = Depends(get_db)):
    """Get a single update with all details."""
    update = db.query(Update).filter(Update.id == update_id).first()
    if not update:
        raise HTTPException(status_code=404, detail="Update not found")
    
    return UpdateResponse(
        id=update.id,
        title=update.title,
        description=update.description,
        implementation_guide=update.implementation_guide,
        status=update.status,
        selected_integration_ids=update.selected_integration_ids or [],
        attachments=update.attachments or [],
        auto_create_pr=update.auto_create_pr or False,
        integration_statuses=get_integration_statuses_with_names(db, update),
        created_at=update.created_at,
        updated_at=update.updated_at
    )


@router.patch("/{update_id}/integrations/{integration_id}")
def update_integration_status(
    update_id: str,
    integration_id: str,
    status_update: UpdateIntegrationStatusUpdate,
    db: Session = Depends(get_db)
):
    """Update the status of a specific integration within an update."""
    update_integration = db.query(UpdateIntegration).filter(
        UpdateIntegration.update_id == update_id,
        UpdateIntegration.integration_id == integration_id
    ).first()
    
    if not update_integration:
        raise HTTPException(status_code=404, detail="Update integration not found")
    
    update_integration.status = status_update.status
    if status_update.pr_url is not None:
        update_integration.pr_url = status_update.pr_url
    if status_update.agent_question is not None:
        update_integration.agent_question = status_update.agent_question
    
    # Check if all integrations are complete to update overall status
    update = db.query(Update).filter(Update.id == update_id).first()
    all_complete = all(
        ui.status in ["complete", "skipped"]
        for ui in update.integration_statuses
    )
    if all_complete:
        update.status = "completed"
    
    db.commit()
    
    return {"success": True}


@router.delete("/{update_id}", status_code=204)
def delete_update(update_id: str, db: Session = Depends(get_db)):
    """Delete an update and all its integration statuses."""
    update = db.query(Update).filter(Update.id == update_id).first()
    if not update:
        raise HTTPException(status_code=404, detail="Update not found")
    
    db.delete(update)
    db.commit()
    return None

