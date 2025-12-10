"""
Agent Orchestrator - Manages Cursor Cloud Agents for integration updates.
"""

import re
import uuid
from typing import Optional, List
from sqlalchemy.orm import Session

from .cursor_client import CursorClient, AgentStatus, CursorClientError
from models import Update, UpdateIntegration, Integration, UpdateIntegrationStatus


def generate_branch_name(integration_name: str, prefix: str = "feat") -> str:
    """
    Generate a conventional branch name.
    
    Args:
        integration_name: Name of the integration
        prefix: Branch prefix (feat, fix, hotfix, bugfix, chore)
    
    Returns:
        Branch name like "feat/my-integration-a1b2c3"
    """
    # Slugify: lowercase, replace spaces/special chars with hyphens
    slug = re.sub(r'[^a-z0-9]+', '-', integration_name.lower()).strip('-')
    short_id = uuid.uuid4().hex[:6]
    return f"{prefix}/{slug}-{short_id}"


PROMPT_TEMPLATE = """# Integration Update Task

## Implementation Guide
{implementation_guide}

## Target Integration: {integration_name}

### GitHub Repositories
{github_links}

### Integration Instructions
{integration_instructions}

### Custom Instructions for This Update
{custom_instructions}

## Your Task

**IMPORTANT: Before making any changes, first check if the changes described in the implementation guide have already been implemented in the codebase.** Search for the relevant code patterns, function names, or features mentioned in the guide. If the changes are already present and complete, report that no changes are needed and end the task without modifying any files.

If the changes have NOT been made yet, proceed with the implementation:
1. Apply the changes described in the implementation guide to this integration's codebase
2. Follow the integration-specific instructions carefully
3. If you need clarification on any aspect of the update, ask a clear question and wait for a response before proceeding

## Code Style Requirements

**Keep edits extremely minimal, focused, and to the point.** Follow these principles:
- Only change what is strictly necessary to implement the requested feature
- Match the existing code style, patterns, and conventions of the project
- When adding parameters, functions, or fields, keep them consistent with similar existing code
- Do NOT create extraneous examples, READMEs, documentation files, or test files unless explicitly requested
- Do NOT refactor, reorganize, or "improve" code that is unrelated to the task
- Do NOT add extra error handling, validation, or features beyond what was requested
- Aim for changes that fit seamlessly into the codebase as if a team member wrote them

**CRITICAL: When you're done, you MUST push your changes to the following branch: `{branch_name}`**. Push to this exact branch name. Do not end the task until the branch has been pushed.
"""


class AgentOrchestrator:
    """Orchestrates Cursor Cloud Agents for integration updates."""
    
    def __init__(self, api_key: str):
        """Initialize orchestrator with Cursor API key."""
        self.api_key = api_key
    
    def build_agent_prompt(
        self,
        implementation_guide: str,
        integration: Integration,
        branch_name: str,
        custom_instructions: str = ""
    ) -> str:
        """
        Build the prompt for a Cursor agent.
        
        Args:
            implementation_guide: The implementation guide from the update
            integration: The integration to update
            branch_name: The branch name to push changes to
            custom_instructions: Per-integration custom instructions
        
        Returns:
            Formatted prompt string
        """
        github_links_str = "\n".join([f"- {link}" for link in integration.github_links]) if integration.github_links else "No GitHub links provided"
        
        return PROMPT_TEMPLATE.format(
            implementation_guide=implementation_guide or "No implementation guide provided.",
            integration_name=integration.name,
            github_links=github_links_str,
            integration_instructions=integration.instructions or "No specific instructions.",
            custom_instructions=custom_instructions or "No additional instructions for this update.",
            branch_name=branch_name
        )
    
    async def start_agent_for_integration(
        self,
        update: Update,
        update_integration: UpdateIntegration,
        integration: Integration,
        auto_create_pr: bool = False
    ) -> tuple[str, str]:
        """
        Start a Cursor agent for a specific integration.
        
        Args:
            update: The parent update
            update_integration: The update-integration record
            integration: The integration to update
            auto_create_pr: Whether to auto-create PR when done
        
        Returns:
            Tuple of (agent_id, branch_name)
        """
        if not integration.github_links:
            raise ValueError(f"Integration {integration.name} has no GitHub links")
        
        # Use the first GitHub link as the repository
        repo_url = integration.github_links[0]
        
        # Generate a branch name for this agent
        branch_name = generate_branch_name(integration.name)
        
        # Build the prompt
        prompt = self.build_agent_prompt(
            implementation_guide=update.implementation_guide,
            integration=integration,
            branch_name=branch_name,
            custom_instructions=update_integration.custom_instructions
        )
        
        # Launch the agent (ref defaults to trying "main" then "master")
        async with CursorClient(self.api_key) as client:
            agent_id = await client.launch_agent(
                repository=repo_url,
                prompt=prompt,
                auto_create_pr=auto_create_pr,
                branch_name=branch_name
            )
        
        return agent_id, branch_name
    
    async def start_all_agents(
        self,
        update_id: str,
        api_key: str,
        db: Session
    ) -> List[str]:
        """
        Start agents for all integrations in an update.
        
        Args:
            update_id: The update ID
            api_key: Cursor API key
            db: Database session
        
        Returns:
            List of launched agent IDs
        """
        update = db.query(Update).filter(Update.id == update_id).first()
        if not update:
            raise ValueError(f"Update not found: {update_id}")
        
        agent_ids = []
        
        for ui in update.integration_statuses:
            # Skip if already has an agent or is skipped/complete
            if ui.cursor_agent_id or ui.status in [
                UpdateIntegrationStatus.SKIPPED.value,
                UpdateIntegrationStatus.COMPLETE.value
            ]:
                continue
            
            integration = db.query(Integration).filter(
                Integration.id == ui.integration_id
            ).first()
            
            if not integration or not integration.github_links:
                # Mark as skipped if no valid repo
                ui.status = UpdateIntegrationStatus.SKIPPED.value
                continue
            
            try:
                # Use per-integration setting if set, otherwise fall back to update-level setting
                should_auto_pr = ui.auto_create_pr if ui.auto_create_pr is not None else (update.auto_create_pr or False)
                
                agent_id, branch_name = await self.start_agent_for_integration(
                    update=update,
                    update_integration=ui,
                    integration=integration,
                    auto_create_pr=should_auto_pr
                )
                
                ui.cursor_agent_id = agent_id
                ui.cursor_branch_name = branch_name  # Store branch name immediately
                ui.status = UpdateIntegrationStatus.IN_PROGRESS.value
                agent_ids.append(agent_id)
                
            except Exception as e:
                # Log error but continue with other integrations
                print(f"Failed to start agent for {integration.name}: {e}")
                ui.agent_question = f"Failed to start agent: {str(e)}"
                ui.status = UpdateIntegrationStatus.NEEDS_REVIEW.value
        
        db.commit()
        return agent_ids
    
    async def sync_agent_status(
        self,
        update_integration_id: str,
        api_key: str,
        db: Session
    ) -> Optional[dict]:
        """
        Sync the status of a single agent from Cursor API.
        
        Args:
            update_integration_id: The UpdateIntegration ID
            api_key: Cursor API key
            db: Database session
        
        Returns:
            Updated status info or None
        """
        ui = db.query(UpdateIntegration).filter(
            UpdateIntegration.id == update_integration_id
        ).first()
        
        if not ui or not ui.cursor_agent_id:
            return None
        
        try:
            async with CursorClient(api_key) as client:
                agent_info = await client.get_agent_status(ui.cursor_agent_id)
                conversation = await client.get_conversation(ui.cursor_agent_id)
            
            # Update branch and PR info
            # Only set branch name from Cursor if we don't already have one
            # (we pass our generated branch name to Cursor, so trust our stored value)
            if agent_info.branch_name and not ui.cursor_branch_name:
                ui.cursor_branch_name = agent_info.branch_name
            if agent_info.pr_url:
                ui.pr_url = agent_info.pr_url
            
            # Store conversation
            ui.conversation = [
                {"id": msg.id, "type": msg.type, "text": msg.text}
                for msg in conversation
            ]
            
            # Check for questions in conversation (last assistant message ends with ?)
            has_pending_question = False
            if conversation:
                last_assistant = None
                for msg in reversed(conversation):
                    if msg.type == "assistant_message":
                        last_assistant = msg
                        break
                
                if last_assistant and last_assistant.text.strip().endswith("?"):
                    ui.agent_question = last_assistant.text
                    has_pending_question = True
            
            # Map Cursor status to our status
            # If there's a pending question, always set NEEDS_REVIEW so user can respond
            if has_pending_question:
                ui.status = UpdateIntegrationStatus.NEEDS_REVIEW.value
            elif agent_info.status == AgentStatus.RUNNING or agent_info.status == AgentStatus.CREATING:
                ui.status = UpdateIntegrationStatus.IN_PROGRESS.value
            elif agent_info.status == AgentStatus.FINISHED:
                if agent_info.pr_url:
                    ui.status = UpdateIntegrationStatus.READY_TO_MERGE.value
                else:
                    ui.status = UpdateIntegrationStatus.READY_TO_MERGE.value
            elif agent_info.status == AgentStatus.STOPPED:
                ui.status = UpdateIntegrationStatus.CANCELLED.value
                ui.agent_question = ui.agent_question or "Agent stopped by user"
            elif agent_info.status == AgentStatus.FAILED:
                ui.status = UpdateIntegrationStatus.NEEDS_REVIEW.value
                ui.agent_question = f"Agent failed: {agent_info.summary or 'Unknown error'}"
            
            db.commit()
            
            return {
                "status": ui.status,
                "branch_name": ui.cursor_branch_name,
                "pr_url": ui.pr_url,
                "agent_status": agent_info.status.value
            }
            
        except CursorClientError as e:
            print(f"Failed to sync agent status: {e}")
            return None
    
    async def sync_all_agents(self, update_id: str, api_key: str, db: Session) -> dict:
        """
        Sync status of all agents for an update.
        
        Args:
            update_id: The update ID
            api_key: Cursor API key
            db: Database session
        
        Returns:
            Summary of synced agents
        """
        update = db.query(Update).filter(Update.id == update_id).first()
        if not update:
            return {"error": "Update not found"}
        
        results = {
            "synced": 0,
            "errors": 0,
            "statuses": {}
        }
        
        for ui in update.integration_statuses:
            if ui.cursor_agent_id:
                try:
                    status = await self.sync_agent_status(ui.id, api_key, db)
                    if status:
                        results["synced"] += 1
                        results["statuses"][ui.integration_id] = status
                except Exception as e:
                    results["errors"] += 1
        
        # Check if all integrations are complete
        all_done = all(
            ui.status in [
                UpdateIntegrationStatus.COMPLETE.value,
                UpdateIntegrationStatus.SKIPPED.value,
                UpdateIntegrationStatus.READY_TO_MERGE.value
            ]
            for ui in update.integration_statuses
        )
        
        if all_done:
            update.status = "completed"
            db.commit()
        
        return results
    
    async def send_followup(
        self,
        update_integration_id: str,
        text: str,
        api_key: str,
        db: Session
    ) -> bool:
        """
        Send a follow-up message to an agent.
        
        Args:
            update_integration_id: The UpdateIntegration ID
            text: Follow-up message text
            api_key: Cursor API key
            db: Database session
        
        Returns:
            True if successful
        """
        ui = db.query(UpdateIntegration).filter(
            UpdateIntegration.id == update_integration_id
        ).first()
        
        if not ui or not ui.cursor_agent_id:
            return False
        
        try:
            async with CursorClient(api_key) as client:
                await client.send_followup(ui.cursor_agent_id, text)
            
            # Clear the question and set back to in progress
            ui.agent_question = None
            ui.status = UpdateIntegrationStatus.IN_PROGRESS.value
            db.commit()
            
            return True
        except CursorClientError as e:
            print(f"Failed to send followup: {e}")
            return False
    
    async def stop_agent(
        self,
        update_integration_id: str,
        api_key: str,
        db: Session
    ) -> bool:
        """
        Stop an agent.
        
        Args:
            update_integration_id: The UpdateIntegration ID
            api_key: Cursor API key
            db: Database session
        
        Returns:
            True if successful
        """
        ui = db.query(UpdateIntegration).filter(
            UpdateIntegration.id == update_integration_id
        ).first()
        
        if not ui or not ui.cursor_agent_id:
            return False
        
        try:
            async with CursorClient(api_key) as client:
                await client.stop_agent(ui.cursor_agent_id)
            
            ui.status = UpdateIntegrationStatus.CANCELLED.value
            ui.agent_question = "Agent stopped by user"
            db.commit()
            
            return True
        except CursorClientError as e:
            print(f"Failed to stop agent: {e}")
            return False

