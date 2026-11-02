import { ApiError } from '@/shared/lib/http'

import { parseLeadDuplicate } from './duplicates'

describe('parseLeadDuplicate', () => {
  it('extrae leads y pacientes del 409 possible_duplicate', () => {
    const error = new ApiError(409, 'conflict', 'Ya existe', {
      details: {
        code: 'possible_duplicate',
        leads: [{ id: 'l1', full_name: 'Ana', status: 'NEW' }],
        patients: [{ id: 'p1', full_name: 'María Gómez' }],
      },
    })
    expect(parseLeadDuplicate(error)).toEqual({
      leads: [{ id: 'l1', fullName: 'Ana', status: 'NEW' }],
      patients: [{ id: 'p1', fullName: 'María Gómez' }],
    })
  })

  it('un 409 que no es de duplicado devuelve null', () => {
    expect(parseLeadDuplicate(new ApiError(409, 'conflict', 'otro'))).toBeNull()
  })

  it('ignora entradas mal formadas sin romper', () => {
    const error = new ApiError(409, 'conflict', 'Ya existe', {
      details: { code: 'possible_duplicate', leads: [{ nombre: 'x' }, null], patients: 'mal' },
    })
    expect(parseLeadDuplicate(error)).toEqual({ leads: [], patients: [] })
  })
})
