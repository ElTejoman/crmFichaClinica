import { describeActivityNotes } from './activityText'

describe('describeActivityNotes', () => {
  it('traduce los códigos de un cambio de estado', () => {
    expect(describeActivityNotes('STATUS_CHANGE', 'NEW → CONTACTED')).toBe('Nuevo → Contactado')
    expect(describeActivityNotes('STATUS_CHANGE', 'QUALIFIED → LOST')).toBe('Calificado → Perdido')
  })

  it('no toca notas escritas por una persona ni textos desconocidos', () => {
    expect(describeActivityNotes('CALL', 'NEW → CONTACTED')).toBe('NEW → CONTACTED')
    expect(describeActivityNotes('STATUS_CHANGE', 'Convertido en paciente')).toBe(
      'Convertido en paciente',
    )
    expect(describeActivityNotes('NOTE', null)).toBeNull()
  })
})
