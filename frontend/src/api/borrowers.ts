import { apiClient } from './client'
import type { Borrower } from '../types'

export async function getBorrowers(): Promise<Borrower[]> {
  const { data } = await apiClient.get<Borrower[]>('/borrowers/')
  return data
}
