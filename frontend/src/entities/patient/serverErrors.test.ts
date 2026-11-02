import { ApiError } from '@/shared/lib/http'

import { mapPatientApiError } from './serverErrors'

describe('mapPatientApiError', () => {
  it('409 de documento repetido: error en el campo y enlace al paciente existente', () => {
    const error = new ApiError(409, 'conflict', 'Ya existe un paciente con ese documento', {
      details: {
        code: 'patient_document_exists',
        patient_id: 'p-1',
        full_name: 'María Gómez Ríos',
      },
    })
    const mapped = mapPatientApiError(error)
    expect(mapped.fieldErrors).toEqual([
      { field: 'document_number', message: 'Ya existe un paciente con ese documento' },
    ])
    expect(mapped.existingPatient).toEqual({ id: 'p-1', fullName: 'María Gómez Ríos' })
  })

  it('422 guardian_required: campo del apoderado y aviso general (puede estar oculto)', () => {
    const mapped = mapPatientApiError(
      new ApiError(422, 'guardian_required', 'Un paciente menor de 18 años requiere apoderado'),
    )
    expect(mapped.fieldErrors[0]?.field).toBe('guardian.name')
    expect(mapped.formError).toBe('Un paciente menor de 18 años requiere apoderado')
  })

  it('422 invalid_birth_date: va al campo fecha de nacimiento', () => {
    const mapped = mapPatientApiError(
      new ApiError(422, 'invalid_birth_date', 'La fecha de nacimiento no puede ser futura'),
    )
    expect(mapped.fieldErrors).toEqual([
      { field: 'birth_date', message: 'La fecha de nacimiento no puede ser futura' },
    ])
    expect(mapped.formError).toBeNull()
  })

  it('422 de validación: cada campo conocido en su sitio (también dentro de {patient})', () => {
    const error = new ApiError(422, 'validation_error', 'x', {
      issues: [
        { path: ['patient', 'guardian', 'phone'], message: 'Teléfono no válido' },
        { path: ['email'], message: 'Correo inválido' },
        { path: ['campo_raro'], message: 'Algo falló' },
      ],
    })
    const mapped = mapPatientApiError(error)
    expect(mapped.fieldErrors).toEqual([
      { field: 'guardian.phone', message: 'Teléfono no válido' },
      { field: 'email', message: 'Correo inválido' },
    ])
    expect(mapped.formError).toBe('Algo falló')
  })

  it('cualquier otro error se muestra como mensaje general (nunca se pierde)', () => {
    const mapped = mapPatientApiError(new ApiError(409, 'conflict', 'Este lead ya fue convertido'))
    expect(mapped.fieldErrors).toEqual([])
    expect(mapped.formError).toBe('Este lead ya fue convertido')
  })
})
