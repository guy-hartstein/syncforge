"""
Cursor Cloud Agents API Client

Based on: https://cursor.com/docs/cloud-agent/api/endpoints
"""

import httpx
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from enum import Enum


class AgentStatus(str, Enum):
    CREATING = "CREATING"
    RUNNING = "RUNNING"
    FINISHED = "FINISHED"
    STOPPED = "STOPPED"
    FAILED = "FAILED"


@dataclass
class AgentInfo:
    id: str
    name: str
    status: AgentStatus
    repository: str
    ref: str
    branch_name: Optional[str] = None
    pr_url: Optional[str] = None
    summary: Optional[str] = None
    created_at: Optional[str] = None


@dataclass
class ConversationMessage:
    id: str
    type: str  # "user_message" or "assistant_message"
    text: str


class CursorClientError(Exception):
    """Base exception for Cursor API errors."""
    pass


class CursorClient:
    """Client for interacting with Cursor Cloud Agents API."""
    
    BASE_URL = "https://api.cursor.com"
    
    def __init__(self, api_key: str):
        """Initialize client with user's API key."""
        self.api_key = api_key
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            auth=(api_key, ""),  # Basic auth with API key
            timeout=30.0
        )
    
    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test the API connection and return key info."""
        response = await self._client.get("/v0/me")
        if response.status_code != 200:
            raise CursorClientError(f"Failed to connect: {response.status_code}")
        return response.json()
    
    async def list_models(self) -> List[str]:
        """Get list of available models for agents."""
        response = await self._client.get("/v0/models")
        if response.status_code != 200:
            raise CursorClientError(f"Failed to list models: {response.status_code}")
        return response.json().get("models", [])
    
    async def launch_agent(
        self,
        repository: str,
        prompt: str,
        ref: str = "main",
        auto_create_pr: bool = False,
        model: Optional[str] = None
    ) -> str:
        """
        Launch a new cloud agent to work on a repository.
        
        Args:
            repository: GitHub repository URL (e.g., "https://github.com/owner/repo")
            prompt: The task prompt for the agent
            ref: Git ref to work from (default: "main")
            auto_create_pr: Whether to automatically create a PR when done
            model: Optional model name (defaults to auto-selection)
        
        Returns:
            The agent ID (e.g., "bc_abc123")
        """
        payload = {
            "prompt": {
                "text": prompt
            },
            "source": {
                "repository": repository,
                "ref": ref
            },
            "target": {
                "autoCreatePr": auto_create_pr,
                "openAsCursorGithubApp": True,
                "skipReviewerRequest": False
            }
        }
        
        if model:
            payload["model"] = model
        
        response = await self._client.post("/v0/agents", json=payload)
        
        if response.status_code not in (200, 201):
            raise CursorClientError(f"Failed to launch agent: {response.status_code} - {response.text}")
        
        data = response.json()
        return data["id"]
    
    async def get_agent_status(self, agent_id: str) -> AgentInfo:
        """
        Get the current status of an agent.
        
        Args:
            agent_id: The agent ID (e.g., "bc_abc123")
        
        Returns:
            AgentInfo with current status and details
        """
        response = await self._client.get(f"/v0/agents/{agent_id}")
        
        if response.status_code == 404:
            raise CursorClientError(f"Agent not found: {agent_id}")
        if response.status_code != 200:
            raise CursorClientError(f"Failed to get agent status: {response.status_code}")
        
        data = response.json()
        
        return AgentInfo(
            id=data["id"],
            name=data.get("name", ""),
            status=AgentStatus(data["status"]),
            repository=data["source"]["repository"],
            ref=data["source"]["ref"],
            branch_name=data.get("target", {}).get("branchName"),
            pr_url=data.get("target", {}).get("prUrl"),
            summary=data.get("summary"),
            created_at=data.get("createdAt")
        )
    
    async def get_conversation(self, agent_id: str) -> List[ConversationMessage]:
        """
        Get the conversation history of an agent.
        
        Args:
            agent_id: The agent ID
        
        Returns:
            List of conversation messages
        """
        response = await self._client.get(f"/v0/agents/{agent_id}/conversation")
        
        if response.status_code == 404:
            raise CursorClientError(f"Agent or conversation not found: {agent_id}")
        if response.status_code != 200:
            raise CursorClientError(f"Failed to get conversation: {response.status_code}")
        
        data = response.json()
        messages = []
        
        for msg in data.get("messages", []):
            messages.append(ConversationMessage(
                id=msg["id"],
                type=msg["type"],
                text=msg["text"]
            ))
        
        return messages
    
    async def send_followup(self, agent_id: str, text: str) -> None:
        """
        Send a follow-up instruction to an agent.
        
        Args:
            agent_id: The agent ID
            text: The follow-up instruction text
        """
        payload = {
            "prompt": {
                "text": text
            }
        }
        
        response = await self._client.post(f"/v0/agents/{agent_id}/followup", json=payload)
        
        if response.status_code not in (200, 201):
            raise CursorClientError(f"Failed to send followup: {response.status_code} - {response.text}")
    
    async def stop_agent(self, agent_id: str) -> None:
        """
        Stop a running agent.
        
        Args:
            agent_id: The agent ID
        """
        response = await self._client.post(f"/v0/agents/{agent_id}/stop")
        
        if response.status_code not in (200, 201):
            raise CursorClientError(f"Failed to stop agent: {response.status_code}")
    
    async def delete_agent(self, agent_id: str) -> None:
        """
        Delete an agent permanently.
        
        Args:
            agent_id: The agent ID
        """
        response = await self._client.delete(f"/v0/agents/{agent_id}")
        
        if response.status_code not in (200, 204):
            raise CursorClientError(f"Failed to delete agent: {response.status_code}")

