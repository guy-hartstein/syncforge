"""
User Settings API Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import UserSettings
from schemas import (
    UserSettingsCreate,
    UserSettingsUpdate,
    UserSettingsResponse,
    TestConnectionResponse
)
from services.cursor_client import CursorClient, CursorClientError

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_or_create_settings(db: Session) -> UserSettings:
    """Get existing settings or create new ones."""
    settings = db.query(UserSettings).first()
    if not settings:
        settings = UserSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=UserSettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    """Get current user settings."""
    settings = get_or_create_settings(db)
    return UserSettingsResponse(
        id=settings.id,
        has_cursor_api_key=bool(settings.cursor_api_key),
        github_connected=bool(settings.github_pat),
        github_username=settings.github_username,
        created_at=settings.created_at,
        updated_at=settings.updated_at
    )


@router.put("", response_model=UserSettingsResponse)
def update_settings(
    settings_update: UserSettingsUpdate,
    db: Session = Depends(get_db)
):
    """Update user settings."""
    settings = get_or_create_settings(db)
    
    if settings_update.cursor_api_key is not None:
        # Store the API key (in production, encrypt this)
        settings.cursor_api_key = settings_update.cursor_api_key
    
    db.commit()
    db.refresh(settings)
    
    return UserSettingsResponse(
        id=settings.id,
        has_cursor_api_key=bool(settings.cursor_api_key),
        github_connected=bool(settings.github_pat),
        github_username=settings.github_username,
        created_at=settings.created_at,
        updated_at=settings.updated_at
    )


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_cursor_connection(db: Session = Depends(get_db)):
    """Test the Cursor API connection with the stored API key."""
    settings = db.query(UserSettings).first()
    
    if not settings or not settings.cursor_api_key:
        return TestConnectionResponse(
            success=False,
            message="No Cursor API key configured"
        )
    
    try:
        async with CursorClient(settings.cursor_api_key) as client:
            info = await client.test_connection()
        
        return TestConnectionResponse(
            success=True,
            message="Connection successful",
            user_email=info.get("userEmail")
        )
    except CursorClientError as e:
        return TestConnectionResponse(
            success=False,
            message=f"Connection failed: {str(e)}"
        )
    except Exception as e:
        return TestConnectionResponse(
            success=False,
            message=f"Unexpected error: {str(e)}"
        )


@router.delete("/cursor-api-key")
def delete_cursor_api_key(db: Session = Depends(get_db)):
    """Remove the stored Cursor API key."""
    settings = db.query(UserSettings).first()
    
    if settings and settings.cursor_api_key:
        settings.cursor_api_key = None
        db.commit()
    
    return {"success": True}

