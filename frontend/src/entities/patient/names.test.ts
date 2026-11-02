import { splitFullName } from './names'

describe('splitFullName', () => {
  it('dos términos: nombre y apellido', () => {
    expect(splitFullName('Ana Soto')).toEqual({ firstName: 'Ana', lastName: 'Soto' })
  })

  it('tres términos: un nombre y dos apellidos (lo más común en Perú)', () => {
    expect(splitFullName('Ana Soto Rojas')).toEqual({ firstName: 'Ana', lastName: 'Soto Rojas' })
  })

  it('cuatro términos: dos nombres y dos apellidos', () => {
    expect(splitFullName('Juan Carlos Pérez Gómez')).toEqual({
      firstName: 'Juan Carlos',
      lastName: 'Pérez Gómez',
    })
  })

  it('las partículas se quedan con el apellido', () => {
    expect(splitFullName('María de los Ángeles Pérez')).toEqual({
      firstName: 'María',
      lastName: 'de los Ángeles Pérez',
    })
    expect(splitFullName('Luis Alberto de la Cruz Soto')).toEqual({
      firstName: 'Luis Alberto',
      lastName: 'de la Cruz Soto',
    })
  })

  it('un solo término o vacío no falla', () => {
    expect(splitFullName('Madonna')).toEqual({ firstName: 'Madonna', lastName: '' })
    expect(splitFullName('   ')).toEqual({ firstName: '', lastName: '' })
  })

  it('ignora espacios repetidos', () => {
    expect(splitFullName('  Ana   Soto  ')).toEqual({ firstName: 'Ana', lastName: 'Soto' })
  })
})
