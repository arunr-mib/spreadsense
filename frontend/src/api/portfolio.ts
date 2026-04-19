import { apiClient as client } from './client'
import type { PortfolioSummary } from '../types'

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const resp = await client.get<PortfolioSummary>('/portfolio/summary')
  return resp.data
}
