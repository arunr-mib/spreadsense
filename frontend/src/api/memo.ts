import { apiClient } from './client'
import type { CreditMemoMeta } from '../types'

export async function getMemoMeta(spreadId: number): Promise<CreditMemoMeta> {
  const { data } = await apiClient.get<CreditMemoMeta>(
    `/spreads/${spreadId}/memo/meta`
  )
  return data
}

export async function saveMemoMeta(
  spreadId: number,
  data: Partial<CreditMemoMeta>
): Promise<CreditMemoMeta> {
  const resp = await apiClient.put<CreditMemoMeta>(
    `/spreads/${spreadId}/memo/meta`,
    data
  )
  return resp.data
}

export async function exportMemoAsPdf(spreadId: number): Promise<ArrayBuffer> {
  const resp = await apiClient.get(`/spreads/${spreadId}/memo/pdf`, {
    responseType: 'arraybuffer',
  })
  return resp.data
}
