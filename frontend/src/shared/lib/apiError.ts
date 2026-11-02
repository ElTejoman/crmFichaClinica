import { FIELD_LABELS } from './labels'

/**
 * Error uniforme del API. `code` es estable (lo define el backend) y `message` ya viene en
 * español y legible; los componentes muestran `message` y, si necesitan reaccionar, miran `code`.
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

/** Código sintético para fallos de red (el servidor no respondió). */
export const NETWORK_ERROR_CODE = 'network_error'
export const VALIDATION_ERROR_CODE = 'validation_error'

interface FastApiIssue {
  loc?: unknown[]
  msg?: string
}

function describeIssue(issue: FastApiIssue): string {
  // `loc` = ['body', 'password']: el primer elemento es el origen, el resto el campo.
  const field = issue.loc?.slice(1).filter((p) => typeof p === 'string')[0]
  const label = typeof field === 'string' ? (FIELD_LABELS[field] ?? field) : null
  const msg = (issue.msg ?? 'valor inválido').replace(/^Value error, /, '')
  return label ? `${label}: ${msg}` : msg
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Convierte el cuerpo de error del API en `ApiError`. Soporta dos formas:
 *  - propia: `{error:{code,message}}`;
 *  - estándar de FastAPI/Pydantic: `{detail:[{loc,msg}]}` (422), que se aplana a una frase.
 */
export function toApiError(status: number, body: unknown, fallback: string): ApiError {
  if (isRecord(body)) {
    const err = body.error
    if (isRecord(err) && typeof err.message === 'string') {
      return new ApiError(status, typeof err.code === 'string' ? err.code : 'unknown', err.message)
    }
    const detail = body.detail
    if (Array.isArray(detail)) {
      const message = detail.filter(isRecord).map(describeIssue).join('. ')
      return new ApiError(status, VALIDATION_ERROR_CODE, message || 'Datos inválidos')
    }
    if (typeof detail === 'string') return new ApiError(status, 'unknown', detail)
  }
  return new ApiError(status, 'unknown', fallback || `Error ${status}`)
}
