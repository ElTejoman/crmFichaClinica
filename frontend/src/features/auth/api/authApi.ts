import { apiGet, apiPost } from '@/shared/lib/http'
import type { TokenResponse, UserRead } from '@/shared/types/aliases'

// Login y logout van con `skipAuth`: un 401 en login significa "credenciales inválidas",
// no "sesión caducada", y no debe disparar un refresh.
export function loginRequest(email: string, password: string): Promise<TokenResponse> {
  return apiPost<TokenResponse>('/auth/login', { email, password }, { skipAuth: true })
}

export function logoutRequest(): Promise<void> {
  return apiPost<void>('/auth/logout', undefined, { skipAuth: true })
}

export function fetchCurrentUser(signal?: AbortSignal): Promise<UserRead> {
  return apiGet<UserRead>('/auth/me', { signal })
}
