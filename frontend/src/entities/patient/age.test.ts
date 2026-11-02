import { calculateAge, isMinor, parseIsoDate } from './age'

describe('calculateAge', () => {
  it('cuenta el cumpleaños: un día antes aún no cumple', () => {
    expect(calculateAge('2008-06-15', '2026-06-14')).toBe(17)
    expect(calculateAge('2008-06-15', '2026-06-15')).toBe(18)
  })

  it('el 29 de febrero cumple recién el 1 de marzo en años no bisiestos', () => {
    expect(calculateAge('2008-02-29', '2026-02-28')).toBe(17)
    expect(calculateAge('2008-02-29', '2026-03-01')).toBe(18)
  })

  it('devuelve null con fechas inválidas', () => {
    expect(calculateAge('', '2026-01-01')).toBeNull()
    expect(calculateAge('2026-02-30', '2026-03-01')).toBeNull()
    expect(calculateAge('10/05/2000', '2026-03-01')).toBeNull()
  })

  it('una fecha futura da edad negativa', () => {
    expect(calculateAge('2030-01-01', '2026-01-01')).toBeLessThan(0)
  })
})

describe('isMinor', () => {
  it('es menor hasta el día anterior a los 18', () => {
    expect(isMinor('2008-06-15', '2026-06-14')).toBe(true)
    expect(isMinor('2008-06-15', '2026-06-15')).toBe(false)
  })

  it('una fecha inválida o futura no se considera menor (no se afirma nada)', () => {
    expect(isMinor('', '2026-06-14')).toBe(false)
    expect(isMinor('2030-01-01', '2026-06-14')).toBe(false)
  })
})

describe('parseIsoDate', () => {
  it('rechaza días inexistentes', () => {
    expect(parseIsoDate('2026-04-31')).toBeNull()
    expect(parseIsoDate('2026-04-30')).toEqual({ year: 2026, month: 4, day: 30 })
  })
})
