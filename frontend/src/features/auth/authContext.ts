import { createContext } from 'react'

import type { UserRead } from '@/shared/types/aliases'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

/** Motivo por el que la sesión terminó sin que el usuario pulsara "Cerrar sesión". */
export type SessionNotice = 'idle' | 'expired'

export interface AuthContextValue {
  user: UserRead | null
  status: AuthStatus
  notice: SessionNotice | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
