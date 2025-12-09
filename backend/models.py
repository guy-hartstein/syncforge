from sqlalchemy import Column, String, Text, DateTime, JSON
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from datetime import datetime
import uuid

from database import Base


class Integration(Base):
    __tablename__ = "integrations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    github_links = Column(JSON, default=list)
    instructions = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


