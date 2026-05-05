import { apiClient } from './client'

export type VarianceCategory =
  | 'revenue'
  | 'margins'
  | 'liquidity'
  | 'leverage'
  | 'working_capital'
  | 'watch'

export interface VarianceBullet {
  text: string
  category: VarianceCategory
}

export interface VarianceCommentaryResponse {
  bullets: VarianceBullet[]
  periods_analyzed: string[]
  generated_at: string
}

export async function generateVarianceCommentary(
  spreadId: number,
): Promise<VarianceCommentaryResponse> {
  const { data } = await apiClient.post<VarianceCommentaryResponse>(
    `/spreads/${spreadId}/variance-commentary`,
  )
  return data
}
