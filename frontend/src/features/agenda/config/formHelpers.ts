import { ApiError } from '@/shared/lib/http'

export interface ConfigErrorMapping {
  /** Campo del formulario al que pertenece el error (si lo hay). */
  field: string | null
  message: string
}

const FIELD_BY_CODE: Record<string, string> = {
  duplicate_name: 'name',
}

/**
 * Ubica el error del servidor: `duplicate_name` junto al nombre; `schedule_overlap` y
 * `invalid_schedule` como mensaje general del formulario (afectan a varios campos a la vez).
 */
export function mapConfigError(error: unknown): ConfigErrorMapping {
  if (!(error instanceof ApiError)) {
    return { field: null, message: 'No se pudo guardar. Revise su conexión e intente de nuevo.' }
  }
  if (error.code === 'schedule_overlap') {
    // El mensaje del servidor ya explica el cruce; solo se añade contexto si viniera vacío.
    return {
      field: null,
      message: error.message || 'Este bloque se cruza con otro horario del mismo doctor.',
    }
  }
  return { field: FIELD_BY_CODE[error.code] ?? null, message: error.message }
}
