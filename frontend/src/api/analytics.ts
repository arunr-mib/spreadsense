import { apiClient } from './client'
import type { SpreadAnalytics } from '../types'

export async function getAnalytics(spreadId: number): Promise<SpreadAnalytics> {
  const { data } = await apiClient.get<SpreadAnalytics>(`/spreads/${spreadId}/analytics`)
  return data
}
