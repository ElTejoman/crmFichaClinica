import { screen, within } from '@testing-library/react'

import { addDaysToKey, limaInstant, todayLimaKey } from '@/shared/lib/dates'
import { makeAppointment } from '@/test/appointments'
import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { TodayView } from './TodayView'

afterEach(() => vi.unstubAllGlobals())

function at(dayKey: string, time: string, minutes = 30) {
  const start = limaInstant(dayKey, time)
  return {
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
  }
}

describe('TodayView', () => {
  it('lista las de hoy con acciones rápidas según estado y las de mañana con WhatsApp sin datos clínicos', async () => {
    const today = todayLimaKey()
    const tomorrow = addDaysToKey(today, 1)
    const todayRows = [
      makeAppointment({
        id: 'h-1',
        patient_name: 'Rosa Quispe',
        status: 'SCHEDULED',
        ...at(today, '09:00'),
      }),
      makeAppointment({
        id: 'h-2',
        patient_name: 'Luis Rojas',
        status: 'CHECKED_IN',
        ...at(today, '10:00'),
      }),
    ]
    const tomorrowRows = [
      makeAppointment({
        id: 'm-1',
        patient_name: 'Marta Díaz',
        patient_phone: '+51 987 654 321',
        specialty: 'DENTISTRY',
        type_name: 'Ortodoncia',
        admin_notes: 'Trae radiografía',
        status: 'CONFIRMED',
        ...at(tomorrow, '16:30'),
      }),
      makeAppointment({
        id: 'm-2',
        patient_name: 'Sin Cancelar',
        status: 'CANCELLED',
        ...at(tomorrow, '17:30'),
      }),
    ]
    installFetch((c) => {
      if (!c.url.startsWith('/api/appointments?')) return undefined
      const from = new URLSearchParams(c.url.split('?')[1]).get('from')
      return jsonResponse(200, from === limaInstant(today).toISOString() ? todayRows : tomorrowRows)
    })
    renderWithAuth(<TodayView user={makeUser(['RECEPTION'])} />, makeUser(['RECEPTION']))

    const todayTable = await screen.findByRole('table', { name: 'Citas de hoy' })
    const rosa = within(todayTable).getByText('Rosa Quispe').closest('tr') as HTMLElement
    expect(within(rosa).getByRole('button', { name: /Confirmar: Rosa Quispe/ })).toBeInTheDocument()
    expect(within(rosa).getByRole('button', { name: /Llegó: Rosa Quispe/ })).toBeInTheDocument()
    // Quien ya llegó solo se puede cancelar (no confirmar ni registrar llegada otra vez).
    const luis = within(todayTable).getByText('Luis Rojas').closest('tr') as HTMLElement
    expect(within(luis).queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument()
    expect(within(luis).queryByRole('button', { name: /Llegó/ })).not.toBeInTheDocument()
    expect(within(luis).getByRole('button', { name: /Cancelar: Luis Rojas/ })).toBeInTheDocument()

    const reminders = await screen.findByRole('table', { name: /mañana/ })
    expect(within(reminders).getByText('Marta Díaz')).toBeInTheDocument()
    expect(within(reminders).queryByText('Sin Cancelar')).not.toBeInTheDocument()
    expect(within(reminders).getByText('16:30')).toBeInTheDocument()
    const link = within(reminders).getByRole('link', { name: /Abrir WhatsApp/ })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('https://wa.me/51987654321?text=')).toBe(true)
    const text = decodeURIComponent(href.split('?text=')[1] ?? '')
    expect(text).toContain('Hola Marta')
    expect(text).toContain('16:30')
    expect(text).not.toMatch(/odontolog|ortodoncia|radiograf/i)
    expect(
      within(reminders).getByRole('button', { name: /Copiar teléfono de Marta Díaz/ }),
    ).toBeInTheDocument()
  })
})
