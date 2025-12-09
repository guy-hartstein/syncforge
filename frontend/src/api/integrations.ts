import type { Integration, IntegrationCreate, IntegrationUpdate } from '../types'

const API_BASE = 'http://localhost:8000/api/integrations'

export async function fetchIntegrations(): Promise<Integration[]> {
  const response = await fetch(API_BASE)
  if (!response.ok) throw new Error('Failed to fetch integrations')
  return response.json()
}

export async function createIntegration(data: IntegrationCreate): Promise<Integration> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to create integration')
  return response.json()
}

export async function updateIntegration(id: string, data: IntegrationUpdate): Promise<Integration> {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to update integration')
  return response.json()
}

export async function deleteIntegration(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to delete integration')
}


