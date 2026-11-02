import { describeNextAction } from './nextAction'

// 2026-03-10 14:00 en Lima (UTC-5) = 19:00 UTC
const NOW = new Date('2026-03-10T19:00:00Z')

describe('describeNextAction', () => {
  it('sin fecha no hay indicador', () => {
    expect(describeNextAction(null, NOW).kind).toBe('none')
  })

  it('una fecha pasada está vencida y lo dice con texto', () => {
    const info = describeNextAction('2026-03-10T15:00:00Z', NOW)
    expect(info.kind).toBe('overdue')
    expect(info.label).toMatch(/^Vencida/)
  })

  it('más tarde hoy (hora de Lima) es "Hoy"', () => {
    expect(describeNextAction('2026-03-10T22:00:00Z', NOW).kind).toBe('today')
  })

  it('23:30 en Lima sigue siendo hoy aunque en UTC ya sea mañana', () => {
    expect(describeNextAction('2026-03-11T04:30:00Z', NOW).kind).toBe('today')
  })

  it('mañana es futura', () => {
    expect(describeNextAction('2026-03-11T15:00:00Z', NOW).kind).toBe('upcoming')
  })
})
