import { apiClient } from './client'
import type { Spread, AuditEntry } from '../types'

export async function patchSpreadStatus(spreadId: number, status: string): Promise<Spread> {
  const { data } = await apiClient.patch<Spread>(`/spreads/${spreadId}/status`, { status })
  return data
}

export async function getSpreadHistory(spreadId: number): Promise<AuditEntry[]> {
  const { data } = await apiClient.get<AuditEntry[]>(`/spreads/${spreadId}/history`)
  return data
}
