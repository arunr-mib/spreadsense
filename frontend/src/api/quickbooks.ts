import { apiClient } from './client'

export interface QbSandboxInfo {
  company: string
  source: string
}

export interface QbImportResult {
  company: string
  fiscal_year: number
  fields_imported: number
  source: string
}

export async function getQbSandboxInfo(): Promise<QbSandboxInfo> {
  const { data } = await apiClient.get<QbSandboxInfo>('/quickbooks/sandbox-info')
  return data
}

export async function importQbTrialBalance(
  spreadId: number,
  periodId: number,
): Promise<QbImportResult> {
  const { data } = await apiClient.post<QbImportResult>(
    `/quickbooks/spreads/${spreadId}/periods/${periodId}/import`,
  )
  return data
}
