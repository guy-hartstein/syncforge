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

export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  html_url: string
  state: string
  user_login: string
  created_at: string
  updated_at: string
  draft: boolean
  head_ref: string
  base_ref: string
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

export async function listRepoPullRequests(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<GitHubPullRequest[]> {
  const response = await fetch(`${API_BASE}/repos/${owner}/${repo}/pulls?state=${state}`)
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('GitHub not connected')
    }
    if (response.status === 404) {
      throw new Error('Repository not found')
    }
    throw new Error('Failed to fetch pull requests')
  }
  const data = await response.json()
  return data.pull_requests
}

export interface BranchStatusResponse {
  branch_exists: boolean
  pr_url: string | null
  pr_number: number | null
  pr_state: string | null  // open, closed, or merged
  merged: boolean
  merged_at: string | null
  last_commit_sha: string | null
}

export async function checkBranchStatus(
  updateId: string,
  integrationId: string
): Promise<BranchStatusResponse> {
  const response = await fetch(`${API_BASE}/check-branch/${updateId}/${integrationId}`)
  if (!response.ok) {
    throw new Error('Failed to check branch status')
  }
  return response.json()
}

export interface GitHubPRDetails {
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  merged: boolean
  merged_at: string | null
  user_login: string
  head_ref: string
  base_ref: string
  diff: string
  additions: number
  deletions: number
  changed_files: number
}

export interface PRStatusResponse {
  state: string
  merged: boolean
  merged_at: string | null
}

// Parse PR URL to extract owner, repo, and PR number
export function parsePrUrl(prUrl: string): { owner: string; repo: string; prNumber: number } | null {
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2], prNumber: parseInt(match[3], 10) }
}

export async function getPRStatus(owner: string, repo: string, prNumber: number): Promise<PRStatusResponse> {
  const response = await fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/status`)
  if (!response.ok) {
    throw new Error('Failed to fetch PR status')
  }
  return response.json()
}

export async function getIntegrationPRStatus(updateId: string, integrationId: string): Promise<PRStatusResponse> {
  const response = await fetch(`${API_BASE}/integration/${updateId}/${integrationId}/pr-status`)
  if (!response.ok) {
    throw new Error('Failed to fetch integration PR status')
  }
  return response.json()
}

export async function getPullRequestDetails(
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPRDetails> {
  const response = await fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}`)
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('GitHub not connected')
    }
    if (response.status === 404) {
      throw new Error('Pull request not found')
    }
    throw new Error('Failed to fetch pull request details')
  }
  return response.json()
}
