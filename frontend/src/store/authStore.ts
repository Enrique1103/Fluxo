import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  isAdmin: boolean
  login: (token: string, isAdmin: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      isAdmin: false,
      login: (token, isAdmin) => set({ token, isAdmin }),
      logout: () => set({ token: null, isAdmin: false }),
    }),
    { name: 'auth' }
  )
)
