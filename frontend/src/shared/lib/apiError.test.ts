import { toApiError } from './apiError'

describe('toApiError', () => {
  it('conserva code, message y details del error propio del servidor', () => {
    const error = toApiError(
      409,
      {
        error: {
          code: 'conflict',
          message: 'Ya existe un paciente con ese documento',
          details: { code: 'patient_document_exists', patient_id: 'p-1' },
        },
      },
      '',
    )
    expect(error.status).toBe(409)
    expect(error.code).toBe('conflict')
    expect(error.message).toBe('Ya existe un paciente con ese documento')
    expect(error.details).toEqual({ code: 'patient_document_exists', patient_id: 'p-1' })
  })

  it('aplana el 422 de FastAPI y conserva cada campo (sin el prefijo body)', () => {
    const error = toApiError(
      422,
      {
        detail: [
          { loc: ['body', 'guardian', 'phone'], msg: 'Value error, Teléfono no válido' },
          { loc: ['body', 'patient', 'document_number'], msg: 'El DNI debe tener 8 dígitos' },
        ],
      },
      '',
    )
    expect(error.code).toBe('validation_error')
    expect(error.issues).toEqual([
      { path: ['guardian', 'phone'], message: 'Teléfono no válido' },
      { path: ['patient', 'document_number'], message: 'El DNI debe tener 8 dígitos' },
    ])
    expect(error.message).toContain('Teléfono no válido')
  })

  it('sin cuerpo utilizable usa el texto de respaldo', () => {
    const error = toApiError(500, null, 'Internal Server Error')
    expect(error.message).toBe('Internal Server Error')
    expect(error.issues).toEqual([])
    expect(error.details).toBeUndefined()
  })
})
