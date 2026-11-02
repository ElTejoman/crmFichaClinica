import {
  addDaysToKey,
  daysBetweenKeys,
  formatDayLong,
  formatDayShort,
  formatSlotLima,
  formatTimeLima,
  formatTimeRangeLima,
  isDateKey,
  limaDateKeyOf,
  limaDayRangeUtc,
  limaToIso,
  limaWeekRangeUtc,
  minutesSinceMidnightLima,
  startOfWeekKey,
  weekDayKeys,
  weekdayIndex,
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

describe('calendario de Lima', () => {
  it('addDaysToKey cruza mes y año sin depender de la zona del proceso', () => {
    expect(addDaysToKey('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysToKey('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('weekdayIndex: 0 = lunes … 6 = domingo', () => {
    expect(weekdayIndex('2026-11-02')).toBe(0) // lunes
    expect(weekdayIndex('2026-11-08')).toBe(6) // domingo
    expect(weekdayIndex('2026-11-07')).toBe(5) // sábado
  })

  it('la semana empieza en lunes, incluso desde un domingo, y puede cruzar año', () => {
    expect(startOfWeekKey('2026-11-02')).toBe('2026-11-02')
    expect(startOfWeekKey('2026-11-08')).toBe('2026-11-02')
    expect(startOfWeekKey('2027-01-01')).toBe('2026-12-28')
    expect(weekDayKeys('2026-12-28')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ])
  })

  it('el rango UTC de un día de Lima empieza a las 05:00Z', () => {
    expect(limaDayRangeUtc('2026-11-03')).toEqual({
      from: '2026-11-03T05:00:00.000Z',
      to: '2026-11-04T05:00:00.000Z',
    })
  })

  it('el rango de la semana cubre 7 días de Lima', () => {
    expect(limaWeekRangeUtc('2026-12-28')).toEqual({
      from: '2026-12-28T05:00:00.000Z',
      to: '2027-01-04T05:00:00.000Z',
    })
  })

  it('minutesSinceMidnightLima: 14:00Z son las 09:00 de Lima, no las 14:00', () => {
    expect(minutesSinceMidnightLima('2026-11-03T14:00:00Z')).toBe(9 * 60)
    expect(minutesSinceMidnightLima('2026-11-03T04:59:00Z')).toBe(23 * 60 + 59)
    expect(minutesSinceMidnightLima('2026-11-03T05:00:00Z')).toBe(0)
  })

  it('formatTimeLima y limaDateKeyOf usan la hora de Lima', () => {
    expect(formatTimeLima('2026-11-03T14:00:00Z')).toBe('09:00')
    expect(formatTimeRangeLima('2026-11-03T14:00:00Z', '2026-11-03T14:30:00Z')).toBe('09:00–09:30')
    // 02:00Z del 4 sigue siendo el 3 en Lima (21:00).
    expect(limaDateKeyOf('2026-11-04T02:00:00Z')).toBe('2026-11-03')
  })

  it('limaToIso arma el instante UTC desde fecha y hora de Lima', () => {
    expect(limaToIso('2026-11-03', '09:00')).toBe('2026-11-03T14:00:00.000Z')
    expect(limaToIso('2026-02-31', '09:00')).toBeNull()
    expect(limaToIso('2026-11-03', '25:00')).toBeNull()
  })

  it('formatos de día legibles y deterministas', () => {
    expect(formatDayShort('2026-11-02')).toBe('lun 02/11')
    expect(formatDayLong('2026-11-03')).toBe('martes 3 de noviembre de 2026')
    expect(formatSlotLima('2026-11-03T14:00:00Z', '2026-11-03T14:30:00Z')).toBe(
      'mar 03/11 · 09:00–09:30',
    )
  })

  it('isDateKey rechaza fechas inexistentes', () => {
    expect(isDateKey('2026-02-28')).toBe(true)
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey('03/11/2026')).toBe(false)
  })

  it('daysBetweenKeys cuenta días calendario', () => {
    expect(daysBetweenKeys('2026-12-30', '2027-01-02')).toBe(3)
  })
})
