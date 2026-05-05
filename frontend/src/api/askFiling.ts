import { apiClient } from './client'

export interface AskResponse {
  answer: string
  source_hint: string | null
  filename: string
  answered_at: string
}

export async function askFiling(
  spreadId: number,
  question: string,
): Promise<AskResponse> {
  const { data } = await apiClient.post<AskResponse>(
    `/spreads/${spreadId}/ask`,
    { question },
  )
  return data
}
