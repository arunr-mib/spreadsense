import { apiClient } from './client'
import type { User } from '../types'

export async function login(email: string, password: string): Promise<User> {
  const { data } = await apiClient.post<User>('/auth/login', { email, password })
  return data
}
