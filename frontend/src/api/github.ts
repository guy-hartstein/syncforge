const API_BASE = 'http://localhost:8000/api/github'

export interface RepoCheckResponse {
  is_valid: boolean
  is_public: boolean
  repo_name: string | null
  error: string | null
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

