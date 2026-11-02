import { isOpen, isReleased } from './status'

describe('estados de cita', () => {
  it('cancelada y ausente liberan el hueco', () => {
    expect(isReleased('CANCELLED')).toBe(true)
    expect(isReleased('NO_SHOW')).toBe(true)
    expect(isReleased('SCHEDULED')).toBe(false)
    expect(isReleased('COMPLETED')).toBe(false)
  })

  it('abiertas: las que todavía pueden avanzar', () => {
    expect(isOpen('IN_PROGRESS')).toBe(true)
    expect(isOpen('COMPLETED')).toBe(false)
    expect(isOpen('CANCELLED')).toBe(false)
  })
})
