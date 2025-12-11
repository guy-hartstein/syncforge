from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Integration
from schemas import IntegrationCreate, IntegrationUpdate, IntegrationResponse

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("", response_model=List[IntegrationResponse])
def list_integrations(db: Session = Depends(get_db)):
    return db.query(Integration).order_by(Integration.created_at.desc()).all()


@router.post("", response_model=IntegrationResponse, status_code=201)
def create_integration(integration: IntegrationCreate, db: Session = Depends(get_db)):
    db_integration = Integration(
        name=integration.name,
        github_links=integration.github_links,
        instructions=integration.instructions,
    )
    db.add(db_integration)
    db.commit()
    db.refresh(db_integration)
    return db_integration


@router.get("/{integration_id}", response_model=IntegrationResponse)
def get_integration(integration_id: str, db: Session = Depends(get_db)):
    integration = db.query(Integration).filter(Integration.id == integration_id).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    return integration


@router.put("/{integration_id}", response_model=IntegrationResponse)
def update_integration(
    integration_id: str, update: IntegrationUpdate, db: Session = Depends(get_db)
):
    integration = db.query(Integration).filter(Integration.id == integration_id).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(integration, key, value)

    db.commit()
    db.refresh(integration)
    return integration


@router.delete("/{integration_id}", status_code=204)
def delete_integration(integration_id: str, db: Session = Depends(get_db)):
    integration = db.query(Integration).filter(Integration.id == integration_id).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    db.delete(integration)
    db.commit()
    return None


@router.delete("/{integration_id}/memories/{memory_id}", status_code=204)
def delete_memory(integration_id: str, memory_id: str, db: Session = Depends(get_db)):
    """Delete a specific memory from an integration."""
    integration = db.query(Integration).filter(Integration.id == integration_id).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    memories = integration.memories or []
    original_count = len(memories)
    memories = [m for m in memories if m.get("id") != memory_id]
    
    if len(memories) == original_count:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    integration.memories = memories
    db.commit()
    return None
