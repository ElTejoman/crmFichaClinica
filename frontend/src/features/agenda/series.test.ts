import { isValidSeries, previewSeries } from './series'

describe('previewSeries', () => {
  it('4 sesiones semanales: mismas 09:00 de Lima, cada 7 días', () => {
    const sessions = previewSeries('2026-11-03T14:00:00Z', 4, 7)
    expect(sessions.map((s) => s.dayKey)).toEqual([
      '2026-11-03',
      '2026-11-10',
      '2026-11-17',
      '2026-11-24',
    ])
    expect(new Set(sessions.map((s) => s.time))).toEqual(new Set(['09:00']))
    expect(sessions.map((s) => s.startsAt)).toEqual([
      '2026-11-03T14:00:00.000Z',
      '2026-11-10T14:00:00.000Z',
      '2026-11-17T14:00:00.000Z',
      '2026-11-24T14:00:00.000Z',
    ])
    expect(sessions.map((s) => s.session)).toEqual([1, 2, 3, 4])
  })

  it('cruza mes y año conservando la hora local', () => {
    const sessions = previewSeries('2026-12-28T20:30:00Z', 3, 5) // 15:30 Lima
    expect(sessions.map((s) => s.dayKey)).toEqual(['2026-12-28', '2027-01-02', '2027-01-07'])
    expect(new Set(sessions.map((s) => s.time))).toEqual(new Set(['15:30']))
  })

  it('una hora de Lima cercana a medianoche no cambia de día al convertir', () => {
    const sessions = previewSeries('2026-11-04T01:00:00Z', 2, 1) // 20:00 del día 3 en Lima
    expect(sessions.map((s) => s.dayKey)).toEqual(['2026-11-03', '2026-11-04'])
    expect(sessions[1]?.startsAt).toBe('2026-11-05T01:00:00.000Z')
  })
})

describe('isValidSeries', () => {
  it('respeta 2-20 sesiones y 1-30 días', () => {
    expect(isValidSeries(2, 1)).toBe(true)
    expect(isValidSeries(20, 30)).toBe(true)
    expect(isValidSeries(1, 7)).toBe(false)
    expect(isValidSeries(21, 7)).toBe(false)
    expect(isValidSeries(4, 0)).toBe(false)
    expect(isValidSeries(4, 31)).toBe(false)
    expect(isValidSeries(3.5, 7)).toBe(false)
  })
})
