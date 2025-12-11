const API_BASE = 'http://localhost:8000/api/wizard'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Attachment {
  id: string
  type: 'file' | 'url' | 'github_pr' | 'linear_issue'
  name: string
  url?: string
  file_path?: string
  content?: string
}

export interface WizardSession {
  id: string
  messages: ChatMessage[]
  attachments: Attachment[]
  selected_integrations: string[]
  integration_configs: Record<string, string>
  clarification_count: number
  ready_to_proceed: boolean
  created_at: string
}

export interface StartWizardResponse {
  session_id: string
  initial_message: string
}

export interface ChatResponse {
  response: string
  ready_to_proceed: boolean
}

export async function startWizard(): Promise<StartWizardResponse> {
  const response = await fetch(`${API_BASE}/start`, { method: 'POST' })
  if (!response.ok) throw new Error('Failed to start wizard')
  return response.json()
}

export async function getSession(sessionId: string): Promise<WizardSession> {
  const response = await fetch(`${API_BASE}/${sessionId}`)
  if (!response.ok) throw new Error('Failed to get session')
  return response.json()
}

export async function sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!response.ok) throw new Error('Failed to send message')
  return response.json()
}

export async function uploadFile(sessionId: string, file: File): Promise<Attachment> {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await fetch(`${API_BASE}/${sessionId}/attachments/file`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error('Failed to upload file')
  return response.json()
}

export async function addUrl(sessionId: string, url: string, name?: string): Promise<Attachment> {
  const response = await fetch(`${API_BASE}/${sessionId}/attachments/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, name }),
  })
  if (!response.ok) throw new Error('Failed to add URL')
  return response.json()
}

export interface PRAttachmentRequest {
  owner: string
  repo: string
  pr_number: number
  title: string
  url: string
}

export interface LinearAttachmentRequest {
  issue_id: string
  identifier: string
  title: string
  url: string
}

export async function addPRAttachment(sessionId: string, pr: PRAttachmentRequest): Promise<Attachment> {
  const response = await fetch(`${API_BASE}/${sessionId}/attachments/pr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pr),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to add PR' }))
    throw new Error(error.detail || 'Failed to add PR attachment')
  }
  return response.json()
}

export async function addLinearAttachment(sessionId: string, issue: LinearAttachmentRequest): Promise<Attachment> {
  const response = await fetch(`${API_BASE}/${sessionId}/attachments/linear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(issue),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to add Linear issue' }))
    throw new Error(error.detail || 'Failed to add Linear issue attachment')
  }
  return response.json()
}

export async function removeAttachment(sessionId: string, attachmentId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${sessionId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('Failed to remove attachment')
}

export async function updateConfig(
  sessionId: string,
  selectedIntegrations: string[],
  integrationConfigs: Record<string, string>
): Promise<void> {
  const response = await fetch(`${API_BASE}/${sessionId}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selected_integrations: selectedIntegrations,
      integration_configs: integrationConfigs,
    }),
  })
  if (!response.ok) throw new Error('Failed to update config')
}

export interface WizardSubmitResponse {
  title: string
  description: string
  implementation_guide: string
  selected_integrations: string[]
  integration_configs: Record<string, string>
  attachments: Attachment[]
}

export async function submitWizard(sessionId: string): Promise<WizardSubmitResponse> {
  const response = await fetch(`${API_BASE}/${sessionId}/submit`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('Failed to submit wizard')
  return response.json()
}

