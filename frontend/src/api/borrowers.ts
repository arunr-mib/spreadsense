import { apiClient } from './client'
import type { Borrower } from '../types'

export async function getBorrowers(): Promise<Borrower[]> {
  const { data } = await apiClient.get<Borrower[]>('/borrowers/')
  return data
}

export async function getBorrowerById(id: number): Promise<Borrower> {
  const { data } = await apiClient.get<Borrower>(`/borrowers/${id}`)
  return data
}

export async function createBorrower(payload: {
  name: string
  industry?: string
  sic_code?: string
  fiscal_year_end_month?: number
}): Promise<Borrower> {
  const { data } = await apiClient.post<Borrower>('/borrowers/', payload)
  return data
}
