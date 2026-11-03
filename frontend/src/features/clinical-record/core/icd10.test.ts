import { normalizeIcd10Code } from './icd10'

describe('normalizeIcd10Code', () => {
  it('pone el punto tras la tercera posición y pasa a mayúsculas', () => {
    expect(normalizeIcd10Code('m545')).toBe('M54.5')
    expect(normalizeIcd10Code(' K02.1 ')).toBe('K02.1')
    expect(normalizeIcd10Code('E11')).toBe('E11')
  })

  it('rechaza lo que no tiene forma de código CIE-10', () => {
    expect(normalizeIcd10Code('lumbalgia')).toBeNull()
    expect(normalizeIcd10Code('U07.1')).toBeNull() // la letra U no se usa
    expect(normalizeIcd10Code('M5')).toBeNull()
    expect(normalizeIcd10Code('')).toBeNull()
  })
})
