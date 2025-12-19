const API_BASE = 'http://localhost:8000/api/updates'

export interface ConversationMessage {
  id: string
  type: 'user_message' | 'assistant_message'
  text: string
}

export interface AgentConversation {
  messages: ConversationMessage[]
  status: string
  agent_id?: string
  branch_name?: string
  pr_url?: string
}

export interface StartAgentsResult {
  started: number
  agent_ids: string[]
}

export async function startAgents(updateId: string): Promise<StartAgentsResult> {
  const response = await fetch(`${API_BASE}/${updateId}/start-agents`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to start agents')
  }
  return response.json()
}

export async function getConversation(
  updateId: string,
  integrationId: string
): Promise<AgentConversation> {
  const response = await fetch(
    `${API_BASE}/${updateId}/integrations/${integrationId}/conversation`
  )
  if (!response.ok) throw new Error('Failed to get conversation')
  return response.json()
}

export async function sendFollowup(
  updateId: string,
  integrationId: string,
  text: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/${updateId}/integrations/${integrationId}/followup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to send followup')
  }
}

export async function stopAgent(
  updateId: string,
  integrationId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/${updateId}/integrations/${integrationId}/stop`,
    { method: 'POST' }
  )
  if (!response.ok) throw new Error('Failed to stop agent')
}

export async function syncAgents(updateId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${updateId}/sync`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('Failed to sync agents')
}

export async function refreshConversation(
  updateId: string,
  integrationId: string
): Promise<AgentConversation> {
  const response = await fetch(
    `${API_BASE}/${updateId}/integrations/${integrationId}/conversation/refresh`,
    { method: 'POST' }
  )
  if (!response.ok) throw new Error('Failed to refresh conversation')
  return response.json()
}

export async function updateIntegrationSettings(
  updateId: string,
  integrationId: string,
  autoCreatePr: boolean
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/${updateId}/integrations/${integrationId}/settings?auto_create_pr=${autoCreatePr}`,
    { method: 'PATCH' }
  )
  if (!response.ok) throw new Error('Failed to update settings')
}

