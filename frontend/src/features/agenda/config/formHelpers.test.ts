import { ApiError } from '@/shared/lib/http'

import { mapConfigError } from './formHelpers'

describe('mapConfigError', () => {
  it('schedule_overlap: mensaje general que explica el cruce', () => {
    const mapped = mapConfigError(
      new ApiError(409, 'schedule_overlap', 'Ya hay un bloque lun 09:00-13:00'),
    )
    expect(mapped.field).toBeNull()
    expect(mapped.message).toBe('Ya hay un bloque lun 09:00-13:00')
  })

  it('duplicate_name: va junto al campo nombre', () => {
    expect(mapConfigError(new ApiError(409, 'duplicate_name', 'Ya existe')).field).toBe('name')
  })

  it('error de red: mensaje de conexión', () => {
    expect(mapConfigError(new Error('x')).message).toMatch(/conexión/)
  })
})
