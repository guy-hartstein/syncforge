import type { Attachment } from './wizard'

const API_BASE = 'http://localhost:8000/api/updates'

export interface ConversationMessage {
  id: string
  type: 'user_message' | 'assistant_message'
  text: string
}

export interface UpdateIntegrationStatus {
  id: string
  update_id: string
  integration_id: string
  integration_name?: string
  github_url?: string  // GitHub repo URL for branch link
  status: 'pending' | 'in_progress' | 'needs_review' | 'ready_to_merge' | 'skipped' | 'complete' | 'cancelled'
  pr_url?: string
  pr_merged: boolean  // Cached merged status from backend
  pr_merged_at?: string | null  // When the PR was merged
  pr_closed: boolean  // Cached closed (without merge) status
  agent_question?: string
  custom_instructions: string
  cursor_agent_id?: string
  cursor_branch_name?: string
  conversation: ConversationMessage[]
  auto_create_pr?: boolean | null  // Per-integration override
  created_at: string
  updated_at: string
}

export interface Update {
  id: string
  title: string
  description: string
  implementation_guide: string
  status: 'creating' | 'in_progress' | 'completed'
  selected_integration_ids: string[]
  attachments: Attachment[]
  auto_create_pr: boolean
  integration_statuses: UpdateIntegrationStatus[]
  created_at: string
  updated_at: string
}

export interface UpdateCreate {
  title?: string
  description?: string
  implementation_guide?: string
  selected_integration_ids: string[]
  attachments: Attachment[]
  integration_configs: Record<string, string>
  messages?: { role: string; content: string }[]  // For background title generation
  auto_create_pr?: boolean
}

export async function fetchUpdates(): Promise<Update[]> {
  const response = await fetch(API_BASE)
  if (!response.ok) throw new Error('Failed to fetch updates')
  return response.json()
}

export async function createUpdate(data: UpdateCreate): Promise<Update> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to create update')
  return response.json()
}

export async function getUpdate(id: string): Promise<Update> {
  const response = await fetch(`${API_BASE}/${id}`)
  if (!response.ok) throw new Error('Failed to get update')
  return response.json()
}

export async function updateIntegrationStatus(
  updateId: string,
  integrationId: string,
  status: string,
  prUrl?: string,
  agentQuestion?: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/${updateId}/integrations/${integrationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      pr_url: prUrl,
      agent_question: agentQuestion,
    }),
  })
  if (!response.ok) throw new Error('Failed to update integration status')
}

export async function deleteUpdate(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to delete update')
}

