import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  login: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (user) => set({ user, token: user.access_token }),
      logout: () => set({ user: null, token: null }),
    }),
    { name: 'fst-auth' }
  )
)
