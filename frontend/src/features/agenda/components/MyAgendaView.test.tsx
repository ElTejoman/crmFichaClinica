import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { limaInstant, todayLimaKey } from '@/shared/lib/dates'
import { makeAppointment } from '@/test/appointments'
import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { MyAgendaView } from './MyAgendaView'

afterEach(() => vi.unstubAllGlobals())

describe('MyAgendaView', () => {
  it('destaca la cola de espera, permite Iniciar y enlaza a la ficha administrativa', async () => {
    const today = todayLimaKey()
    const start = limaInstant(today, '09:00').toISOString()
    const end = limaInstant(today, '09:30').toISOString()
    const doctor = makeUser(['DOCTOR'], { id: 'd-1' })
    const rows = [
      makeAppointment({
        id: 'q-1',
        patient_name: 'Rosa Quispe',
        status: 'CHECKED_IN',
        checked_in_at: start,
        starts_at: start,
        ends_at: end,
      }),
      makeAppointment({
        id: 'r-1',
        patient_name: 'Luis Rojas',
        status: 'CONFIRMED',
        starts_at: limaInstant(today, '11:00').toISOString(),
        ends_at: limaInstant(today, '11:30').toISOString(),
      }),
    ]
    const calls = installFetch(
      (c) =>
        c.method === 'POST' && c.url === '/api/appointments/q-1/start'
          ? jsonResponse(200, { ...rows[0], status: 'IN_PROGRESS' })
          : undefined,
      (c) => (c.url.startsWith('/api/appointments?') ? jsonResponse(200, rows) : undefined),
    )
    const user = userEvent.setup()
    renderWithAuth(<MyAgendaView user={doctor} />, doctor)

    const queue = await screen
      .findByRole('region', { name: /Cola de espera \(1\)/ })
      .catch(() => null)
    expect(queue ?? screen.getByRole('heading', { name: 'Cola de espera (1)' })).toBeTruthy()
    // Solo se consultan las citas del propio doctor.
    const url = calls.find((c) => c.url.startsWith('/api/appointments?'))?.url ?? ''
    expect(new URLSearchParams(url.split('?')[1]).get('doctor_id')).toBe('d-1')

    const rosa = screen.getByText('Rosa Quispe').closest('li') as HTMLElement
    expect(within(rosa).getByRole('link', { name: 'Ficha administrativa' })).toHaveAttribute(
      'href',
      '/pacientes/p-1',
    )
    // El que aún no llegó no tiene botón de iniciar.
    const luis = screen.getByText('Luis Rojas').closest('li') as HTMLElement
    expect(within(luis).queryByRole('button', { name: /Iniciar/ })).not.toBeInTheDocument()

    await user.click(within(rosa).getByRole('button', { name: /Iniciar atención: Rosa Quispe/ }))
    expect(await screen.findByText(/Atención de Rosa Quispe iniciada/)).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/appointments/q-1/start')).toBe(true)
    expect(screen.getByText(/lleva a su ficha administrativa/)).toBeInTheDocument()
  })

  it('con la ficha clínica inyectada, «Iniciar atención» abre el encuentro y reemplaza al inicio simple', async () => {
    const today = todayLimaKey()
    const start = limaInstant(today, '09:00').toISOString()
    const doctor = makeUser(['DOCTOR'], { id: 'd-1' })
    const waiting = makeAppointment({
      id: 'q-1',
      patient_name: 'Rosa Quispe',
      status: 'CHECKED_IN',
      checked_in_at: start,
      starts_at: start,
      ends_at: limaInstant(today, '09:30').toISOString(),
    })
    installFetch((c) =>
      c.url.startsWith('/api/appointments?') ? jsonResponse(200, [waiting]) : undefined,
    )
    renderWithAuth(
      <MyAgendaView
        user={doctor}
        renderClinicalAction={(a) => <button type="button">Abrir ficha de {a.patient_name}</button>}
      />,
      doctor,
    )
    expect(
      await screen.findByRole('button', { name: 'Abrir ficha de Rosa Quispe' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Iniciar atención: Rosa Quispe/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/abre la ficha clínica del encuentro/)).toBeInTheDocument()
  })
})
