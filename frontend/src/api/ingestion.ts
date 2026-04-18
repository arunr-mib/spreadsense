import { apiClient } from './client'
import type { ExtractionJob } from '../types'

export async function uploadDocument(spreadId: number, file: File): Promise<ExtractionJob> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<ExtractionJob>(
    `/ingestion/upload?spread_id=${spreadId}`, form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return data
}

export async function getExtractionJob(jobId: number): Promise<ExtractionJob> {
  const { data } = await apiClient.get<ExtractionJob>(`/ingestion/${jobId}`)
  return data
}

export async function confirmExtraction(
  jobId: number,
  periodId: number,
  overrides: Record<string, number> = {}
): Promise<ExtractionJob> {
  const { data } = await apiClient.post<ExtractionJob>(`/ingestion/${jobId}/confirm`, {
    period_id: periodId,
    overrides,
  })
  return data
}
