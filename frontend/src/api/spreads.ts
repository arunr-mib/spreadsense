import { apiClient } from './client'
import type { Spread } from '../types'

export async function getSpreads(): Promise<Spread[]> {
  const { data } = await apiClient.get<Spread[]>('/spreads/')
  return data
}

export async function createSpread(payload: {
  borrower_id: number
  deal_name: string
  loan_type_id?: number
}): Promise<Spread> {
  const { data } = await apiClient.post<Spread>('/spreads/', payload)
  return data
}
