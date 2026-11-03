import { ApiError } from '@/shared/lib/http'

const HTTP_FORBIDDEN = 403

export const FORBIDDEN_CLINICAL_MESSAGE =
  'No tiene acceso a este contenido clínico: se requiere el permiso correspondiente y una relación terapéutica activa con el paciente.'

const GENERIC_ERROR = 'No se pudo completar la operación. Revise su conexión e intente de nuevo.'

export interface MissingRequirement {
  code: string
  message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Lo que falta para firmar según el servidor (`signing_blocked` -> `details.missing`). */
export function signingBlockedItems(error: unknown): MissingRequirement[] {
  if (!(error instanceof ApiError) || error.code !== 'signing_blocked') return []
  const missing = error.details?.missing
  if (!Array.isArray(missing)) return []
  const items: MissingRequirement[] = []
  for (const entry of missing) {
    if (isRecord(entry) && typeof entry.code === 'string' && typeof entry.message === 'string') {
      items.push({ code: entry.code, message: entry.message })
    }
  }
  return items
}

/** Id del encuentro ya existente cuando la cita ya tenía uno (409 `encounter_exists`). */
export function existingEncounterId(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'encounter_exists') return null
  const id = error.details?.encounter_id
  return typeof id === 'string' ? id : null
}

/** El encuentro dejó de ser editable (se firmó en otra pestaña): la pantalla debe recargarse. */
export function isNotEditable(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'encounter_not_editable'
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === HTTP_FORBIDDEN
}

/**
 * Traduce un error del API clínico a una frase accionable (los mensajes del servidor ya vienen en español). El 403 nunca se muestra como fallo
 * técnico: es la regla de relación terapéutica funcionando.
 */
export function describeClinicalError(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC_ERROR
  if (error.status === HTTP_FORBIDDEN) return FORBIDDEN_CLINICAL_MESSAGE
  if (error.code === 'signing_blocked') return 'Faltan requisitos para firmar este encuentro.'
  return error.message || GENERIC_ERROR
}
