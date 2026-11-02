/**
 * Cliente HTTP mínimo. Todas las llamadas del front pasan por aquí para centralizar:
 *  - prefijo `/api` (proxy hacia el backend),
 *  - credenciales (cookie httpOnly del refresh token, Fase 1),
 *  - traducción uniforme de errores del API (`{error:{code,message}}`).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const API_PREFIX = '/api'

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  })
  // `/ready` responde 503 con cuerpo JSON válido: se devuelve igualmente (ver ApiStatus).
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok && response.status !== 503) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(response.status, err?.code ?? 'unknown', err?.message ?? response.statusText)
  }
  return body as T
}
