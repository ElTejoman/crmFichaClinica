import type { LeadStatus } from '@/shared/types/aliases'

import { allowedTargets, canMove, isOpenStatus, requiresLostReason } from './kanbanRules'

describe('allowedTargets (reglas del embudo)', () => {
  it('entre estados abiertos se mueve libremente, también hacia atrás, y se puede perder', () => {
    expect(allowedTargets('NEW')).toEqual(['CONTACTED', 'QUALIFIED', 'APPOINTMENT_SET', 'LOST'])
    expect(allowedTargets('APPOINTMENT_SET')).toEqual(['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'])
  })

  it('CONVERTED nunca es destino manual', () => {
    const all: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'APPOINTMENT_SET', 'LOST']
    for (const from of all) expect(allowedTargets(from)).not.toContain('CONVERTED')
  })

  it('un lead perdido solo se reabre como NEW', () => {
    expect(allowedTargets('LOST')).toEqual(['NEW'])
    expect(canMove('LOST', 'QUALIFIED')).toBe(false)
  })

  it('un lead convertido no se mueve', () => {
    expect(allowedTargets('CONVERTED')).toEqual([])
  })

  it('no se ofrece moverlo a su propia etapa', () => {
    expect(canMove('NEW', 'NEW')).toBe(false)
  })
})

describe('requiresLostReason / isOpenStatus', () => {
  it('solo LOST exige motivo', () => {
    expect(requiresLostReason('LOST')).toBe(true)
    expect(requiresLostReason('NEW')).toBe(false)
  })

  it('distingue estados abiertos de cerrados', () => {
    expect(isOpenStatus('QUALIFIED')).toBe(true)
    expect(isOpenStatus('LOST')).toBe(false)
    expect(isOpenStatus('CONVERTED')).toBe(false)
  })
})
