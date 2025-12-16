export interface Memory {
  id: string
  content: string
  created_at: string
}

export interface Integration {
  id: string
  name: string
  github_links: string[]
  instructions: string
  memories: Memory[]
  auto_create_pr: boolean
  created_at: string
  updated_at: string
}

export interface IntegrationCreate {
  name: string
  github_links: string[]
  instructions: string
  auto_create_pr?: boolean
}

export interface IntegrationUpdate {
  name?: string
  github_links?: string[]
  instructions?: string
  auto_create_pr?: boolean
}
