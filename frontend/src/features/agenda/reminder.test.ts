import { makeAppointment } from '@/test/appointments'

import { buildReminderMessage, buildWhatsAppUrl, phoneDigits } from './reminder'

describe('recordatorio por WhatsApp', () => {
  it('lleva día y hora de Lima, nombre de pila y doctor', () => {
    const message = buildReminderMessage(makeAppointment())
    expect(message).toContain('Hola Rosa')
    expect(message).toContain('martes 3 de noviembre de 2026')
    expect(message).toContain('09:00')
    expect(message).toContain('Ana Torres')
  })

  it('NO incluye datos clínicos: especialidad, tipo de cita ni notas administrativas', () => {
    const message = buildReminderMessage(
      makeAppointment({
        specialty: 'DENTISTRY',
        type_name: 'Ortodoncia control',
        admin_notes: 'Trae radiografía',
      }),
    )
    expect(message).not.toMatch(/odontolog|ortodoncia|radiograf|acupuntura/i)
  })

  it('arma wa.me solo con dígitos y el texto codificado', () => {
    const url = buildWhatsAppUrl('+51 912-345-678', 'Hola & adiós')
    expect(url).toBe('https://wa.me/51912345678?text=Hola%20%26%20adi%C3%B3s')
    expect(phoneDigits('+51 (912) 345-678')).toBe('51912345678')
  })

  it('sin teléfono no hay enlace', () => {
    expect(buildWhatsAppUrl(null, 'x')).toBeNull()
    expect(buildWhatsAppUrl('sin número', 'x')).toBeNull()
  })
})
