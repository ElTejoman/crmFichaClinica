import {
  formatCalendarDate,
  formatDateTimeLima,
  formatShortDateTimeLima,
  limaDateKey,
  localInputToIso,
} from './dates'

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

describe('limaDateKey', () => {
  it('usa la fecha de Lima, no la UTC (23:30 en Lima ya es el día siguiente en UTC)', () => {
    expect(limaDateKey(new Date('2026-03-11T04:30:00Z'))).toBe('2026-03-10')
    expect(limaDateKey(new Date('2026-03-11T05:00:00Z'))).toBe('2026-03-11')
  })
})

describe('formatCalendarDate', () => {
  it('muestra un date de Postgres como dd/mm/aaaa sin mover de día', () => {
    expect(formatCalendarDate('2010-01-05')).toBe('05/01/2010')
  })

  it('devuelve el texto original si no es una fecha ISO', () => {
    expect(formatCalendarDate('ayer')).toBe('ayer')
  })
})

describe('formatShortDateTimeLima', () => {
  it('omite los segundos y usa hora de Lima', () => {
    expect(formatShortDateTimeLima('2026-03-10T15:30:45Z')).toContain('10:30')
  })
})

describe('localInputToIso', () => {
  it('convierte datetime-local a ISO con zona (el servidor rechaza fechas sin zona)', () => {
    const iso = localInputToIso('2026-03-10T09:15')
    expect(iso).toMatch(/Z$/)
    expect(new Date(iso ?? '').getTime()).toBe(new Date('2026-03-10T09:15').getTime())
  })

  it('vacío o inválido da null (limpia la próxima acción)', () => {
    expect(localInputToIso('')).toBeNull()
    expect(localInputToIso('no-fecha')).toBeNull()
  })
})
