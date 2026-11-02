import { buildDuplicateQuery } from './duplicates'

const TODAY = '2026-06-15'
const base = { first_name: 'María', last_name: 'Gómez', birth_date: '', phone: '' }

describe('buildDuplicateQuery', () => {
  it('solo con nombre y apellido NO consulta (habría demasiados homónimos)', () => {
    expect(buildDuplicateQuery(base, TODAY)).toBeNull()
  })

  it('nombre completo + fecha de nacimiento válida consulta', () => {
    expect(buildDuplicateQuery({ ...base, birth_date: '1990-05-01' }, TODAY)).toEqual({
      first_name: 'María',
      last_name: 'Gómez',
      birth_date: '1990-05-01',
      phone: null,
    })
  })

  it('nombre completo + teléfono válido consulta', () => {
    expect(buildDuplicateQuery({ ...base, phone: ' 912345678 ' }, TODAY)).toMatchObject({
      birth_date: null,
      phone: '912345678',
    })
  })

  it('ignora una fecha futura o un teléfono inválido', () => {
    expect(
      buildDuplicateQuery({ ...base, birth_date: '2030-01-01', phone: '12' }, TODAY),
    ).toBeNull()
  })

  it('exige al menos 2 letras en nombre y apellido', () => {
    expect(
      buildDuplicateQuery({ ...base, first_name: 'M', birth_date: '1990-05-01' }, TODAY),
    ).toBeNull()
  })
})
