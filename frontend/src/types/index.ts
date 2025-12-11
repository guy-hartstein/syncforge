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
  created_at: string
  updated_at: string
}

export interface IntegrationCreate {
  name: string
  github_links: string[]
  instructions: string
}

export interface IntegrationUpdate {
  name?: string
  github_links?: string[]
  instructions?: string
}
