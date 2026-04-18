import { apiClient } from './client'
import type { NarrativeVersion } from '../types'

export async function getNarrative(spreadId: number): Promise<NarrativeVersion> {
  const { data } = await apiClient.get<NarrativeVersion>(`/spreads/${spreadId}/narrative`)
  return data
}

export async function generateNarrative(spreadId: number): Promise<NarrativeVersion> {
  const { data } = await apiClient.post<NarrativeVersion>(
    `/spreads/${spreadId}/narrative/generate`
  )
  return data
}

export async function saveNarrative(
  spreadId: number,
  content: string
): Promise<NarrativeVersion> {
  const { data } = await apiClient.post<NarrativeVersion>(
    `/spreads/${spreadId}/narrative`,
    { content }
  )
  return data
}

export async function getNarrativeVersions(spreadId: number): Promise<NarrativeVersion[]> {
  const { data } = await apiClient.get<NarrativeVersion[]>(
    `/spreads/${spreadId}/narrative/versions`
  )
  return data
}
