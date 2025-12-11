from typing import Annotated, TypedDict, Literal, Optional
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
import os


class MemoryExtraction(BaseModel):
    """Structured output for memory extraction."""
    memory: str = Field(default="", description="The extracted memory, or empty string if none")




class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    clarification_count: int
    ready_to_proceed: bool


IMPLEMENTATION_REQUIREMENTS = """
## Code Quality Requirements (CRITICAL)
- **PRESERVE EXISTING CODE STYLE**: Match the formatting patterns already present in each file. If parameters are defined inline, keep them inline. If the codebase uses single-line definitions, do not expand to multi-line JSON/dict formats.
- **FOCUS ON THE TASK AT HAND**: Only make changes that are directly related to the task at hand. Do not reformat, reorganize, or "improve" code that isn't directly related to the update. 
- **CONSISTENT FORMATTING**: Follow the existing indentation (spaces vs tabs, indent size), line length conventions, and bracket placement style of each repository.
- **PRECISE INDENTATION**: Pay meticulous attention to indentation levels. Python is whitespace-sensitive - incorrect indentation causes runtime errors. Always match the exact indentation pattern of surrounding code.
- **MINIMAL DIFF**: Make the smallest possible changes to achieve the goal. Avoid reformatting, reorganizing, or "improving" code that isn't directly related to the update. Never add new tests or documentation unless explicitly requested.
- **LINT-CLEAN**: Ensure changes pass standard linting (no trailing whitespace, consistent quotes, proper spacing around operators).

## Security Requirements for Public Integrations
- If any integration is marked as PUBLIC or external-facing, DO NOT expose internal implementation details such as: internal parameter names (e.g., use_cache, internal_timeout), internal endpoints, debug flags, internal IDs, or any configuration that reveals system architecture.
- Public integrations should only expose the documented public API surface.
- When in doubt, ask for clarification before exposing any parameter or detail.
"""

SYSTEM_PROMPT = """You are an assistant helping users update their software integrations. Your role is to:

1. Understand what changes the user wants to make to their integrations
2. Ask clarifying questions as needed to ensure you understand the scope and details
3. Summarize the update request when you have enough information

Keep your responses concise and friendly. Focus on:
- What specific changes are being made (API updates, bug fixes, new features, etc.)
- Any breaking changes or special considerations
- Parameter types, default values, optionality, etc.
- Technical details that would help implement the update

IMPORTANT: 
- Do NOT ask which integrations are affected - the user selects that separately in the UI
- If the user attaches a GitHub PR or other reference, review it carefully and use the information from the diff/content to understand the changes
- When a PR is attached, acknowledge it and summarize the key changes you see in the diff
- Ask if any of the selected integrations are PUBLIC (external-facing). Public integrations require extra care to avoid exposing internal implementation details (e.g., internal parameter names, debug flags, cache configs).

When you feel you have enough information, end your message with: "I have enough information to proceed. Click 'Start Update' when you're ready."

Continue the conversation naturally until you have a clear understanding of what needs to be updated."""


class UpdateAgent:
    def __init__(self):
        self.llm = self._get_llm()
        self.graph = self._build_graph()
    
    def _get_llm(self):
        """Initialize LLM based on available API keys."""
        openai_key = os.getenv("OPENAI_API_KEY")
        
        if openai_key:
            return ChatOpenAI(model="gpt-4.1", temperature=0.7)
        
    def _build_graph(self) -> StateGraph:
        """Build the LangGraph state graph."""
        
        def chat_node(state: AgentState) -> AgentState:
            """Process user message and generate response."""
            if not self.llm:
                # Mock response when no API key
                return self._mock_response(state)
            
            messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
            response = self.llm.invoke(messages)
            
            # Check if ready to proceed
            ready = "enough information to proceed" in response.content.lower()
            
            return {
                "messages": [response],
                "clarification_count": state["clarification_count"] + 1,
                "ready_to_proceed": ready
            }
        
        def should_continue(state: AgentState) -> Literal["continue", "end"]:
            """Determine if we should continue or end."""
            if state["ready_to_proceed"]:
                return "end"
            return "continue"
        
        # Build graph
        graph = StateGraph(AgentState)
        graph.add_node("chat", chat_node)
        graph.set_entry_point("chat")
        graph.add_conditional_edges(
            "chat",
            should_continue,
            {"continue": END, "end": END}
        )
        
        return graph.compile()
    
    def _mock_response(self, state: AgentState) -> AgentState:
        """Generate mock response when no API key is configured."""
        count = state["clarification_count"]
        last_message = state["messages"][-1].content.lower() if state["messages"] else ""
        
        # Check if user indicates they're done or ready
        ready_phrases = ["that's all", "that's it", "ready", "done", "let's go", "start", "proceed"]
        user_ready = any(phrase in last_message for phrase in ready_phrases)
        
        if count == 0:
            content = "Hi! I'll help you update your integrations. What changes are you making? For example, are you updating APIs, fixing bugs, adding new features, or something else?"
        elif user_ready:
            content = "Got it! I have enough information to proceed. Here's what I understand:\n\n- You want to update your integrations with the changes you described\n- I'll apply these updates to your selected integrations\n\nClick 'Start Update' when you're ready."
        else:
            content = "Thanks for the details! Is there anything else I should know about this update, or are you ready to proceed?"
        
        return {
            "messages": [AIMessage(content=content)],
            "clarification_count": count + 1,
            "ready_to_proceed": user_ready
        }
    
    def get_initial_message(self) -> str:
        """Get the initial greeting message."""
        if not self.llm:
            return "Hi! I'll help you update your integrations. What changes would you like to make? Feel free to describe the update, link any PRs, or attach relevant files."
        
        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content="Start the conversation by greeting me and asking what updates I want to make.")
        ]
        response = self.llm.invoke(messages)
        return response.content
    
    def chat(self, messages: list[BaseMessage], clarification_count: int = 0, attachments: list[dict] = None) -> dict:
        """Process a chat message and return response."""
        state: AgentState = {
            "messages": messages,
            "clarification_count": clarification_count,
            "ready_to_proceed": False
        }
        
        result = self.graph.invoke(state)
        
        # Get the last AI message
        ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
        response_content = ai_messages[-1].content if ai_messages else "I'm ready to help with your update."
        
        return {
            "response": response_content,
            "clarification_count": result["clarification_count"],
            "ready_to_proceed": result["ready_to_proceed"]
        }
    
    def generate_title(self, conversation: list[dict]) -> str:
        """Generate a short title (3-5 words) from the conversation."""
        if not self.llm:
            # Fallback title
            from datetime import datetime
            return f"Update - {datetime.now().strftime('%b %d')}"
        
        conversation_text = "\n".join([
            f"{msg['role']}: {msg['content']}" 
            for msg in conversation
        ])
        
        messages = [
            SystemMessage(content="Generate a very short title (3-10 words max) that summarizes this integration update. Return ONLY the title, nothing else."),
            HumanMessage(content=conversation_text)
        ]
        
        response = self.llm.invoke(messages)
        return response.content.strip().strip('"')
    
    def generate_implementation_guide(self, conversation: list[dict], attachments: list[dict]) -> str:
        """Generate an implementation guide markdown document from the conversation."""
        if not self.llm:
            # Fallback guide
            conversation_text = "\n".join([
                f"- **{msg['role']}**: {msg['content']}" 
                for msg in conversation
            ])
            return f"""# Implementation Guide

## Overview
This document contains the implementation details gathered from the update wizard conversation.

## Conversation Summary
{conversation_text}

## Attachments
{chr(10).join([f"- [{a.get('name', 'Attachment')}]({a.get('url', '')})" for a in attachments]) if attachments else "No attachments provided."}

## Instructions
Follow the changes described in the conversation above to update each integration.
{IMPLEMENTATION_REQUIREMENTS}"""
        
        conversation_text = "\n".join([
            f"{msg['role'].upper()}: {msg['content']}" 
            for msg in conversation
        ])
        
        attachments_text = "\n".join([
            f"- {a.get('name', 'Attachment')}: {a.get('url', a.get('file_path', 'N/A'))}"
            for a in attachments
        ]) if attachments else "None"
        
        messages = [
            SystemMessage(content="""Generate a detailed implementation guide in Markdown format based on the conversation below. 
The guide should include:
1. Overview - A summary of what needs to be updated
2. Changes Required - Detailed list of changes to implement
3. Technical Details - Any specific technical requirements mentioned
4. Breaking Changes - Any breaking changes or migration notes
5. References - Links to PRs, documentation, or other resources

Keep it concise but comprehensive. This will be used by an AI agent to implement the updates."""),
            HumanMessage(content=f"""CONVERSATION:
{conversation_text}

ATTACHMENTS:
{attachments_text}""")
        ]
        
        response = self.llm.invoke(messages)
        return response.content + IMPLEMENTATION_REQUIREMENTS

    def extract_memory(self, user_message: str, context: str = "") -> Optional[str]:
        """
        Analyze a user message for actionable preferences worth remembering.
        Uses structured output for reliable parsing.
        Returns a formatted memory string if found, None otherwise.
        """
        if not self.llm:
            # Simple heuristic fallback when no LLM
            preference_phrases = [
                "don't", "dont", "never", "always", "prefer", "should not",
                "shouldn't", "make sure", "remember to", "keep", "avoid"
            ]
            msg_lower = user_message.lower()
            if any(phrase in msg_lower for phrase in preference_phrases):
                return f"User preference: {user_message}"
            return None
        
        # Use structured output for reliable parsing
        structured_llm = self.llm.with_structured_output(MemoryExtraction)
        
        messages = [
            SystemMessage(content="""You analyze user messages for preferences or instructions that should be remembered for future updates to this integration.

A memorable preference is:
- A specific instruction about HOW to make changes (e.g., "don't edit the README", "always add tests")
- A coding style preference (e.g., "use TypeScript", "prefer async/await")
- A file or area to avoid or focus on
- A general guideline for this integration

NOT memorable:
- General conversation or questions
- One-time instructions specific to the current task
- Acknowledgments like "ok", "thanks", "sounds good"

If the message contains a memorable preference, set memory to a concise, reusable statement (1-2 sentences max).
If there is no memorable preference, set memory to an empty string.

Examples:
- "don't edit the README" → memory: "Do not edit the README file when making updates"
- "always make sure to run the tests" → memory: "Always run tests after making changes"
- "ok that looks good" → memory: ""
- "can you also add error handling?" → memory: "" (one-time request)
- "I prefer using arrow functions" → memory: "Prefer arrow functions over regular function declarations"
"""),
            HumanMessage(content=f"""Context: {context}

User message: {user_message}""")
        ]
        
        result: MemoryExtraction = structured_llm.invoke(messages)
        
        return result.memory if result.memory else None


# Singleton instance
_agent_instance = None

def get_update_agent() -> UpdateAgent:
    """Get or create the update agent singleton."""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = UpdateAgent()
    return _agent_instance

