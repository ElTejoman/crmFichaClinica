import { ApiError } from '@/shared/lib/http'

import {
  describeClinicalError,
  existingEncounterId,
  FORBIDDEN_CLINICAL_MESSAGE,
  isNotEditable,
  signingBlockedItems,
} from './serverErrors'

describe('serverErrors clínicos', () => {
  it('un 403 se explica como regla de acceso, no como fallo técnico', () => {
    const error = new ApiError(403, 'permission_denied', 'No tienes acceso')
    expect(describeClinicalError(error)).toBe(FORBIDDEN_CLINICAL_MESSAGE)
  })

  it('el resto muestra el mensaje en español del servidor; lo no-API, uno genérico', () => {
    expect(describeClinicalError(new ApiError(422, 'invalid_vitals', 'Peso fuera de rango'))).toBe(
      'Peso fuera de rango',
    )
    expect(describeClinicalError(new Error('boom'))).toMatch(/No se pudo completar/)
  })

  it('signing_blocked: extrae lo que falta y descarta entradas mal formadas', () => {
    const error = new ApiError(422, 'signing_blocked', 'Faltan requisitos', {
      details: {
        missing: [{ code: 'plan', message: 'Falta el plan' }, { code: 1 }, 'x'],
      },
    })
    expect(signingBlockedItems(error)).toEqual([{ code: 'plan', message: 'Falta el plan' }])
    expect(signingBlockedItems(new ApiError(422, 'otro', 'x'))).toEqual([])
  })

  it('encounter_exists devuelve el id existente; encounter_not_editable se reconoce', () => {
    const exists = new ApiError(409, 'encounter_exists', 'Ya existe', {
      details: { encounter_id: 'e-9' },
    })
    expect(existingEncounterId(exists)).toBe('e-9')
    expect(existingEncounterId(new ApiError(409, 'otro', 'x'))).toBeNull()
    expect(isNotEditable(new ApiError(409, 'encounter_not_editable', 'x'))).toBe(true)
    expect(isNotEditable(new ApiError(409, 'otro', 'x'))).toBe(false)
  })
})
