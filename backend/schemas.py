from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime


class IntegrationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    github_links: List[str] = Field(default_factory=list)
    instructions: str = ""


class IntegrationCreate(IntegrationBase):
    pass


class IntegrationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    github_links: Optional[List[str]] = None
    instructions: Optional[str] = None


class IntegrationResponse(IntegrationBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Wizard Schemas
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str
    ready_to_proceed: bool


class Attachment(BaseModel):
    id: str
    type: str  # "file" or "url"
    name: str
    url: Optional[str] = None
    file_path: Optional[str] = None


class AttachmentUrlRequest(BaseModel):
    url: str
    name: Optional[str] = None


class IntegrationConfig(BaseModel):
    integration_id: str
    custom_instructions: str = ""


class WizardConfigRequest(BaseModel):
    selected_integrations: List[str]  # List of integration IDs, empty = all
    integration_configs: Dict[str, str] = {}  # integration_id -> custom instructions


class WizardSession(BaseModel):
    id: str
    messages: List[ChatMessage]
    attachments: List[Attachment]
    selected_integrations: List[str]
    integration_configs: Dict[str, str]
    clarification_count: int
    ready_to_proceed: bool
    created_at: datetime


class WizardStartResponse(BaseModel):
    session_id: str
    initial_message: str


# Update Schemas
class UpdateIntegrationStatusEnum(str):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    NEEDS_REVIEW = "needs_review"
    READY_TO_MERGE = "ready_to_merge"
    SKIPPED = "skipped"
    COMPLETE = "complete"


class UpdateIntegrationBase(BaseModel):
    integration_id: str
    status: str = "pending"
    pr_url: Optional[str] = None
    agent_question: Optional[str] = None
    custom_instructions: str = ""


class UpdateIntegrationResponse(UpdateIntegrationBase):
    id: str
    update_id: str
    integration_name: Optional[str] = None  # Populated from join
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UpdateIntegrationStatusUpdate(BaseModel):
    status: str
    pr_url: Optional[str] = None
    agent_question: Optional[str] = None


class UpdateCreate(BaseModel):
    title: Optional[str] = None  # Optional - will be generated if messages provided
    description: str = ""
    implementation_guide: str = ""
    selected_integration_ids: List[str] = []  # Empty = all
    attachments: List[dict] = []
    integration_configs: Dict[str, str] = {}  # integration_id -> custom instructions
    messages: Optional[List[Dict[str, str]]] = None  # For background title generation


class UpdateResponse(BaseModel):
    id: str
    title: str
    description: str
    implementation_guide: str
    status: str
    selected_integration_ids: List[str]
    attachments: List[dict]
    integration_statuses: List[UpdateIntegrationResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UpdateListResponse(BaseModel):
    id: str
    title: str
    status: str
    selected_integration_ids: List[str]
    integration_statuses: List[UpdateIntegrationResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


