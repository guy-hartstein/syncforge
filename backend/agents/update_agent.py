from typing import Annotated, TypedDict, Literal, Optional
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
import os

from prompts import IMPLEMENTATION_REQUIREMENTS, UPDATE_WIZARD_SYSTEM_PROMPT


class MemoryExtraction(BaseModel):
    """Structured output for memory extraction."""
    memory: str = Field(default="", description="The extracted memory, or empty string if none")


class TitleAndGuide(BaseModel):
    """Structured output for combined title and implementation guide generation."""
    title: str = Field(description="A short title (3-10 words) summarizing the update")
    implementation_guide: str = Field(description="A detailed markdown implementation guide")


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    clarification_count: int
    ready_to_proceed: bool


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
            
            messages = [SystemMessage(content=UPDATE_WIZARD_SYSTEM_PROMPT)] + state["messages"]
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
            SystemMessage(content=UPDATE_WIZARD_SYSTEM_PROMPT),
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
    
    def generate_title_and_guide(self, conversation: list[dict], attachments: list[dict]) -> tuple[str, str]:
        """Generate both title and implementation guide in a single LLM call."""
        from datetime import datetime
        
        conversation_text = "\n".join([
            f"{msg['role'].upper()}: {msg['content']}" 
            for msg in conversation
        ])
        
        attachments_text = "\n".join([
            f"- {a.get('name', 'Attachment')}: {a.get('url', a.get('file_path', 'N/A'))}"
            for a in attachments
        ]) if attachments else "None"
        
        if not self.llm:
            # Fallback when no LLM
            fallback_title = f"Update - {datetime.now().strftime('%b %d')}"
            fallback_guide = f"""# Implementation Guide

## Overview
This document contains the implementation details gathered from the update wizard conversation.

## Conversation Summary
{conversation_text}

## Attachments
{chr(10).join([f"- [{a.get('name', 'Attachment')}]({a.get('url', '')})" for a in attachments]) if attachments else "No attachments provided."}

## Instructions
Follow the changes described in the conversation above to update each integration.
{IMPLEMENTATION_REQUIREMENTS}"""
            return fallback_title, fallback_guide
        
        structured_llm = self.llm.with_structured_output(TitleAndGuide)
        
        messages = [
            SystemMessage(content="""Analyze the conversation and generate two outputs:

1. **title**: A very short title (3-10 words max) summarizing this integration update.

2. **implementation_guide**: A detailed implementation guide in Markdown format including:
   - Overview - A summary of what needs to be updated
   - Changes Required - Detailed list of changes to implement
   - Technical Details - Any specific technical requirements mentioned
   - Breaking Changes - Any breaking changes or migration notes
   - References - Links to PRs, documentation, or other resources

Keep the guide concise but comprehensive. It will be used by an AI agent to implement the updates."""),
            HumanMessage(content=f"""CONVERSATION:
{conversation_text}

ATTACHMENTS:
{attachments_text}""")
        ]
        
        result: TitleAndGuide = structured_llm.invoke(messages)
        return result.title.strip().strip('"'), result.implementation_guide + IMPLEMENTATION_REQUIREMENTS

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

