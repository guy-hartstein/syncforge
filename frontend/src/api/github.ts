const API_BASE = 'http://localhost:8000/api/github'

export interface RepoCheckResponse {
  is_valid: boolean
  is_public: boolean
  repo_name: string | null
  error: string | null
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  html_url: string
  private: boolean
  description: string | null
  default_branch: string
}

export interface GitHubStatus {
  connected: boolean
  username: string | null
}

export async function checkGitHubRepo(url: string): Promise<RepoCheckResponse> {
  const response = await fetch(`${API_BASE}/check-repo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!response.ok) throw new Error('Failed to check repository')
  return response.json()
}

export async function saveGitHubToken(token: string): Promise<{ success: boolean; username: string }> {
  const response = await fetch(`${API_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to save token' }))
    throw new Error(error.detail || 'Failed to save token')
  }
  return response.json()
}

export async function deleteGitHubToken(): Promise<void> {
  const response = await fetch(`${API_BASE}/token`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to delete token')
}

export async function getGitHubStatus(): Promise<GitHubStatus> {
  const response = await fetch(`${API_BASE}/status`)
  if (!response.ok) throw new Error('Failed to get GitHub status')
  return response.json()
}

export async function listGitHubRepos(): Promise<GitHubRepo[]> {
  const response = await fetch(`${API_BASE}/repos`)
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('GitHub not connected')
    }
    throw new Error('Failed to fetch repositories')
  }
  const data = await response.json()
  return data.repos
}
