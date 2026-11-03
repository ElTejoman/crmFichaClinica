/**
 * Cliente HTTP único. Todas las llamadas del front pasan por aquí para centralizar:
 *  - prefijo `/api` (proxy hacia el backend),
 *  - `Authorization: Bearer` con el access token en memoria,
 *  - renovación de sesión ante 401 (UN solo refresh compartido + UN reintento),
 *  - traducción uniforme de errores (`ApiError`).
 */
import { clearAccessToken, getAccessToken, setAccessToken } from './accessToken'
import { ApiError, NETWORK_ERROR_CODE, toApiError } from './apiError'
import type { TokenResponse } from '@/shared/types/aliases'

export { ApiError }

const API_PREFIX = '/api'
const HTTP_UNAUTHORIZED = 401
const HTTP_NO_CONTENT = 204

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  signal?: AbortSignal
  /** Cuerpo JSON (POST/PATCH). */
  body?: unknown
  /** Cuerpo multipart (subida de archivos). El navegador fija el `Content-Type` con su boundary. */
  formData?: FormData
  /** `Accept` de la petición; por defecto JSON (las descargas piden cualquier tipo). */
  accept?: string
  /** Sin Bearer ni reintento por 401: login/refresh/logout (un 401 ahí es la respuesta, no sesión caducada). */
  skipAuth?: boolean
  /** Estados no-2xx que se devuelven como éxito (p. ej. `/ready` responde 503 con JSON válido). */
  acceptStatuses?: readonly number[]
}

/* ---------- Renovación de sesión ---------- */

let refreshInFlight: Promise<string | null> | null = null
let sessionExpiredHandler: (() => void) | null = null

/** Quien gestiona la sesión (AuthProvider) se entera aquí cuando ya no hay forma de renovarla. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

async function requestNewAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_PREFIX}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      clearAccessToken()
      return null
    }
    const tokens = (await response.json()) as TokenResponse
    setAccessToken(tokens.access_token)
    return tokens.access_token
  } catch {
    clearAccessToken()
    return null
  }
}

/**
 * Pide un nuevo access token usando la cookie de refresh. Las llamadas simultáneas comparten
 * una única petición: el refresh token rota en cada uso, así que dos refresh paralelos con la
 * misma cookie harían saltar la detección de reutilización del servidor y revocarían la sesión.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= requestNewAccessToken().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

/* ---------- Peticiones ---------- */

async function send(method: Method, path: string, options: RequestOptions, token: string | null) {
  const headers: Record<string, string> = { Accept: options.accept ?? 'application/json' }
  // Con multipart NO se fija Content-Type: sin el boundary que añade el navegador el servidor no lo lee.
  if (options.body !== undefined && options.formData === undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token && !options.skipAuth) headers.Authorization = `Bearer ${token}`
  try {
    return await fetch(`${API_PREFIX}${path}`, {
      method,
      credentials: 'include',
      headers,
      body:
        options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, NETWORK_ERROR_CODE, 'No se pudo conectar con el servidor. Reintente.')
  }
}

/** Envía y, si el servidor responde 401, renueva la sesión UNA vez y reintenta UNA vez. */
async function sendWithRefresh(method: Method, path: string, options: RequestOptions) {
  const tokenUsed = getAccessToken()
  const response = await send(method, path, options, tokenUsed)
  if (response.status !== HTTP_UNAUTHORIZED || options.skipAuth) return response

  // Si otra petición ya renovó el token mientras esta volaba, basta reintentar con el nuevo.
  const current = getAccessToken()
  const fresh = current && current !== tokenUsed ? current : await refreshAccessToken()
  if (!fresh) {
    sessionExpiredHandler?.()
    return response
  }
  const retried = await send(method, path, options, fresh)
  if (retried.status === HTTP_UNAUTHORIZED) sessionExpiredHandler?.()
  return retried
}

export async function apiRequest<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await sendWithRefresh(method, path, options)
  if (response.status === HTTP_NO_CONTENT) return undefined as T
  const body: unknown = await response.json().catch(() => null)
  const accepted = options.acceptStatuses?.includes(response.status) ?? false
  if (!response.ok && !accepted) throw toApiError(response.status, body, response.statusText)
  return body as T
}

export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return apiRequest<T>('GET', path, options)
}

export function apiPost<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return apiRequest<T>('POST', path, { ...options, body })
}

export function apiPatch<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
  return apiRequest<T>('PATCH', path, { ...options, body })
}

/** Sube un archivo (multipart) con el mismo Bearer y la misma renovación de sesión que el resto. */
export function apiUpload<T>(
  path: string,
  formData: FormData,
  options?: RequestOptions,
): Promise<T> {
  return apiRequest<T>('POST', path, { ...options, formData })
}

/**
 * Descarga binaria autenticada: el endpoint exige Bearer, así que un `<a href>` directo no
 * serviría. Devuelve el `Blob`; quien lo use debe revocar la URL temporal que cree.
 */
export async function apiDownload(path: string, options: RequestOptions = {}): Promise<Blob> {
  const response = await sendWithRefresh('GET', path, { ...options, accept: '*/*' })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw toApiError(response.status, body, response.statusText)
  }
  return response.blob()
}

export function apiDelete(path: string, options?: RequestOptions): Promise<void> {
  return apiRequest<void>('DELETE', path, options)
}
