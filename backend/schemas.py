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


