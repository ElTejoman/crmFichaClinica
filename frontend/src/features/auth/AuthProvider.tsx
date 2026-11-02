import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { clearAccessToken, setAccessToken } from '@/shared/lib/accessToken'
import { refreshAccessToken, setSessionExpiredHandler } from '@/shared/lib/http'
import type { UserRead } from '@/shared/types/aliases'

import { fetchCurrentUser, loginRequest, logoutRequest } from './api/authApi'
import { AuthContext, type AuthContextValue, type SessionNotice } from './authContext'
import { useIdleLogout } from './hooks/useIdleLogout'

interface SessionState {
  status: AuthContextValue['status']
  user: UserRead | null
}

const LOADING: SessionState = { status: 'loading', user: null }
const ANONYMOUS: SessionState = { status: 'anonymous', user: null }

/**
 * Dueño de la sesión. Al montar intenta un refresh silencioso (la cookie httpOnly sobrevive a
 * la recarga; el access token en memoria no) y luego carga el perfil con `/auth/me`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<SessionState>(LOADING)
  const [notice, setNotice] = useState<SessionNotice | null>(null)

  const endSession = useCallback(
    (reason: SessionNotice | null) => {
      clearAccessToken()
      // La caché puede contener datos de otra persona: se descarta al terminar la sesión.
      queryClient.clear()
      setSession(ANONYMOUS)
      setNotice(reason)
    },
    [queryClient],
  )

  useEffect(() => {
    let cancelled = false
    async function restore() {
      const token = await refreshAccessToken()
      if (!token) {
        if (!cancelled) setSession(ANONYMOUS)
        return
      }
      try {
        const user = await fetchCurrentUser()
        if (!cancelled) setSession({ status: 'authenticated', user })
      } catch {
        clearAccessToken()
        if (!cancelled) setSession(ANONYMOUS)
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSessionExpiredHandler(() => endSession('expired'))
    return () => setSessionExpiredHandler(null)
  }, [endSession])

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await loginRequest(email, password)
    setAccessToken(tokens.access_token)
    try {
      const user = await fetchCurrentUser()
      setSession({ status: 'authenticated', user })
      setNotice(null)
    } catch (error) {
      clearAccessToken()
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    // Aunque falle la red, la sesión local debe cerrarse: se ignora el error del servidor.
    await logoutRequest().catch(() => undefined)
    endSession(null)
  }, [endSession])

  const logoutByInactivity = useCallback(() => {
    void logoutRequest()
      .catch(() => undefined)
      .finally(() => endSession('idle'))
  }, [endSession])

  useIdleLogout(session.status === 'authenticated', logoutByInactivity)

  const value = useMemo<AuthContextValue>(
    () => ({ user: session.user, status: session.status, notice, login, logout }),
    [session, notice, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
