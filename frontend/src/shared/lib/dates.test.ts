import { formatDateTimeLima } from './dates'

describe('formatDateTimeLima', () => {
  it('convierte UTC a hora de Lima (UTC-5)', () => {
    expect(formatDateTimeLima('2026-03-10T15:30:00Z')).toContain('10:30')
  })

  it('interpreta un ISO sin zona como UTC', () => {
    expect(formatDateTimeLima('2026-03-10T15:30:00')).toContain('10:30')
  })

  it('devuelve el texto original si no es una fecha', () => {
    expect(formatDateTimeLima('no-fecha')).toBe('no-fecha')
  })
})
