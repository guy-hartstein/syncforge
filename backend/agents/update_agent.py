from typing import Annotated, TypedDict, Literal
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langchain_openai import ChatOpenAI
import os




class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    clarification_count: int
    ready_to_proceed: bool


SYSTEM_PROMPT = """You are an assistant helping users update their software integrations. Your role is to:

1. Understand what changes the user wants to make to their integrations
2. Ask clarifying questions as needed to ensure you understand the scope and details
3. Summarize the update request when you have enough information

Keep your responses concise and friendly. Focus on:
- What specific changes are being made (API updates, bug fixes, new features, etc.)
- Any breaking changes or special considerations
- Parameter types, default values, optionality, etc.
- Technical details that would help implement the update

IMPORTANT: Do NOT ask which integrations are affected - the user selects that separately in the UI. Assume that most integrations do not require complex architectural considerations, so keep the conversation foucsed on generic aspects of the update. 

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
    
    def chat(self, messages: list[BaseMessage], clarification_count: int = 0) -> dict:
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


# Singleton instance
_agent_instance = None

def get_update_agent() -> UpdateAgent:
    """Get or create the update agent singleton."""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = UpdateAgent()
    return _agent_instance

