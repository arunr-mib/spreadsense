import { apiClient } from './client'
import type { SpreadPeriod, SpreadLineItem, Adjustment } from '../types'

export async function getPeriods(spreadId: number): Promise<SpreadPeriod[]> {
  const { data } = await apiClient.get<SpreadPeriod[]>(`/spreads/${spreadId}/periods`)
  return data
}

export async function createPeriod(spreadId: number, payload: {
  fiscal_year: number; period_type: 'actual' | 'projected'
}): Promise<SpreadPeriod> {
  const { data } = await apiClient.post<SpreadPeriod>(`/spreads/${spreadId}/periods`, payload)
  return data
}

export async function getLineItems(
  spreadId: number, periodId: number, statement: string
): Promise<SpreadLineItem[]> {
  const { data } = await apiClient.get<SpreadLineItem[]>(
    `/spreads/${spreadId}/periods/${periodId}/line-items`,
    { params: { statement } }
  )
  return data
}

export async function upsertLineItem(
  spreadId: number,
  periodId: number,
  fieldKey: string,
  value: number | null,
  updatedAt: string | null
): Promise<SpreadLineItem> {
  const { data } = await apiClient.put<SpreadLineItem>(
    `/spreads/${spreadId}/periods/${periodId}/line-items/${fieldKey}`,
    { value, updated_at: updatedAt }
  )
  return data
}

export async function getAdjustments(spreadId: number, periodId: number): Promise<Adjustment[]> {
  const { data } = await apiClient.get<Adjustment[]>(
    `/spreads/${spreadId}/periods/${periodId}/adjustments`
  )
  return data
}

export async function createAdjustment(
  spreadId: number, periodId: number,
  payload: { spread_line_item_id: number; delta: number; reason: string }
): Promise<Adjustment> {
  const { data } = await apiClient.post<Adjustment>(
    `/spreads/${spreadId}/periods/${periodId}/adjustments`, payload
  )
  return data
}
