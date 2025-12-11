const API_BASE = 'http://localhost:8000/api/settings'

export interface UserSettings {
  id: string
  has_cursor_api_key: boolean
  github_connected: boolean
  github_username: string | null
  linear_connected: boolean
  preferred_model: string | null
  created_at: string
  updated_at: string
}

export interface TestConnectionResult {
  success: boolean
  message: string
  user_email?: string
}

export interface ModelsResponse {
  models: string[]
  error?: string
}

export interface UpdateSettingsPayload {
  cursor_api_key?: string
  preferred_model?: string
}

export async function fetchSettings(): Promise<UserSettings> {
  const response = await fetch(API_BASE)
  if (!response.ok) throw new Error('Failed to fetch settings')
  return response.json()
}

export async function updateSettings(payload: UpdateSettingsPayload): Promise<UserSettings> {
  const response = await fetch(API_BASE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error('Failed to update settings')
  return response.json()
}

export async function fetchModels(): Promise<ModelsResponse> {
  const response = await fetch(`${API_BASE}/models`)
  if (!response.ok) throw new Error('Failed to fetch models')
  return response.json()
}

export async function testConnection(): Promise<TestConnectionResult> {
  const response = await fetch(`${API_BASE}/test-connection`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('Failed to test connection')
  return response.json()
}

export async function deleteCursorApiKey(): Promise<void> {
  const response = await fetch(`${API_BASE}/cursor-api-key`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('Failed to delete API key')
}

