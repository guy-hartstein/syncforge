const API_BASE = 'http://localhost:8000/api/linear'

export interface LinearTeam {
  id: string
  name: string
  key: string
}

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  url: string
  state_name: string
  priority: number
  assignee_name: string | null
  created_at: string
  updated_at: string
}

export interface LinearStatus {
  connected: boolean
}

export async function saveLinearToken(apiKey: string): Promise<{ success: boolean; name: string; email: string }> {
  const response = await fetch(`${API_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to save API key' }))
    throw new Error(error.detail || 'Failed to save API key')
  }
  return response.json()
}

export async function deleteLinearToken(): Promise<void> {
  const response = await fetch(`${API_BASE}/token`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to delete API key')
}

export async function getLinearStatus(): Promise<LinearStatus> {
  const response = await fetch(`${API_BASE}/status`)
  if (!response.ok) throw new Error('Failed to get Linear status')
  return response.json()
}

export async function listLinearTeams(): Promise<LinearTeam[]> {
  const response = await fetch(`${API_BASE}/teams`)
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Linear not connected')
    }
    throw new Error('Failed to fetch teams')
  }
  const data = await response.json()
  return data.teams
}

export async function listTeamIssues(
  teamId: string,
  state: 'active' | 'completed' | 'canceled' | 'all' = 'active'
): Promise<LinearIssue[]> {
  const response = await fetch(`${API_BASE}/teams/${teamId}/issues?state=${state}`)
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Linear not connected')
    }
    throw new Error('Failed to fetch issues')
  }
  const data = await response.json()
  return data.issues
}
