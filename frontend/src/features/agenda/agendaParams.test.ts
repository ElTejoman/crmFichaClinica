import {
  parseAgendaParams,
  shiftDate,
  toAgendaSearch,
  visibleDayKeys,
  visibleRange,
} from './agendaParams'

const TODAY = '2026-11-03'

describe('parámetros de la agenda', () => {
  it('por defecto: semana de hoy, calendario, sin filtros', () => {
    expect(parseAgendaParams(new URLSearchParams(), TODAY)).toEqual({
      dateKey: TODAY,
      scope: 'semana',
      mode: 'calendario',
      doctorId: '',
      specialty: '',
      roomId: '',
      showReleased: false,
    })
  })

  it('ignora fechas y especialidades inválidas de la URL', () => {
    const params = parseAgendaParams(
      new URLSearchParams('fecha=2026-02-31&especialidad=MAGIA'),
      TODAY,
    )
    expect(params.dateKey).toBe(TODAY)
    expect(params.specialty).toBe('')
  })

  it('ida y vuelta por la URL', () => {
    const original = parseAgendaParams(
      new URLSearchParams('fecha=2026-12-30&vista=dia&modo=lista&doctor=d-1&sala=r-1&canceladas=1'),
      TODAY,
    )
    const roundTrip = parseAgendaParams(toAgendaSearch(original, TODAY), TODAY)
    expect(roundTrip).toEqual(original)
  })

  it('la semana va de lunes a domingo y cruza el año', () => {
    const keys = visibleDayKeys({ dateKey: '2027-01-01', scope: 'semana' })
    expect(keys[0]).toBe('2026-12-28')
    expect(keys[6]).toBe('2027-01-03')
    expect(visibleDayKeys({ dateKey: '2027-01-01', scope: 'dia' })).toEqual(['2027-01-01'])
  })

  it('el rango a consultar es el de Lima (05:00Z de lunes a 05:00Z del lunes siguiente)', () => {
    expect(visibleRange({ dateKey: '2026-11-04', scope: 'semana' })).toEqual({
      from: '2026-11-02T05:00:00.000Z',
      to: '2026-11-09T05:00:00.000Z',
    })
  })

  it('anterior/siguiente: ±7 días en semana, ±1 en día', () => {
    expect(shiftDate({ dateKey: '2026-12-30', scope: 'semana' }, 1)).toBe('2027-01-06')
    expect(shiftDate({ dateKey: '2026-12-31', scope: 'dia' }, 1)).toBe('2027-01-01')
    expect(shiftDate({ dateKey: '2026-03-01', scope: 'dia' }, -1)).toBe('2026-02-28')
  })
})
