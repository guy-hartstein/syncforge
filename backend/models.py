from sqlalchemy import Column, String, Text, DateTime, JSON, ForeignKey, Enum, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from database import Base


class Integration(Base):
    __tablename__ = "integrations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    github_links = Column(JSON, default=list)
    instructions = Column(Text, default="")
    memories = Column(JSON, default=list)  # List of {id, content, created_at}
    auto_create_pr = Column(Boolean, default=False)  # Default auto-create PR setting for this integration
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UpdateStatus(str, enum.Enum):
    CREATING = "creating"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class UpdateIntegrationStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    NEEDS_REVIEW = "needs_review"
    READY_TO_MERGE = "ready_to_merge"
    SKIPPED = "skipped"
    COMPLETE = "complete"
    CANCELLED = "cancelled"


class Update(Base):
    __tablename__ = "updates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    implementation_guide = Column(Text, default="")
    status = Column(String(20), default=UpdateStatus.IN_PROGRESS.value)
    selected_integration_ids = Column(JSON, default=list)  # Empty = all
    attachments = Column(JSON, default=list)
    auto_create_pr = Column(Boolean, default=False)  # Whether to auto-create PRs
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to UpdateIntegration
    integration_statuses = relationship("UpdateIntegration", back_populates="update", cascade="all, delete-orphan")


class UpdateIntegration(Base):
    __tablename__ = "update_integrations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    update_id = Column(String(36), ForeignKey("updates.id", ondelete="CASCADE"), nullable=False)
    integration_id = Column(String(36), ForeignKey("integrations.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default=UpdateIntegrationStatus.PENDING.value)
    pr_url = Column(String(500), nullable=True)
    pr_merged = Column(Boolean, default=False)  # Cached merged status
    pr_merged_at = Column(DateTime, nullable=True)  # When the PR was merged
    pr_closed = Column(Boolean, default=False)  # Cached closed (without merge) status
    agent_question = Column(Text, nullable=True)
    custom_instructions = Column(Text, default="")
    cursor_agent_id = Column(String(50), nullable=True)  # Cursor agent ID (e.g., "bc_abc123")
    cursor_branch_name = Column(String(255), nullable=True)  # Branch created by agent
    conversation = Column(JSON, default=list)  # Cached conversation messages
    auto_create_pr = Column(Boolean, nullable=True)  # Per-integration override for auto PR creation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    update = relationship("Update", back_populates="integration_statuses")
    integration = relationship("Integration")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    cursor_api_key = Column(Text, nullable=True)  # Encrypted Cursor API key
    cursor_webhook_secret = Column(String(64), nullable=True)  # Secret for verifying Cursor webhooks
    cursor_webhook_url = Column(String(500), nullable=True)  # Public URL for Cursor to send webhooks
    github_pat = Column(Text, nullable=True)  # GitHub Personal Access Token
    github_username = Column(String(255), nullable=True)  # GitHub username
    linear_api_key = Column(Text, nullable=True)  # Linear API key
    preferred_model = Column(String(100), nullable=True)  # Preferred model for agents
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


