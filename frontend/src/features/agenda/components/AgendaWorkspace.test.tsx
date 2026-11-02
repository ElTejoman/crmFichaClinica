import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { makeAppointment } from '@/test/appointments'
import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { AgendaWorkspace } from './AgendaWorkspace'

afterEach(() => vi.unstubAllGlobals())

const appointments = [
  makeAppointment({ id: 'a-1', patient_name: 'Rosa Quispe' }),
  makeAppointment({
    id: 'a-2',
    patient_name: 'Luis Rojas',
    status: 'CANCELLED',
    starts_at: '2026-11-04T15:00:00Z',
    ends_at: '2026-11-04T15:30:00Z',
  }),
]

function handlers() {
  return [
    (c: { url: string }) =>
      c.url.startsWith('/api/appointments?') ? jsonResponse(200, appointments) : undefined,
    (c: { url: string }) =>
      c.url === '/api/doctors'
        ? jsonResponse(200, [{ id: 'd-1', full_name: 'Ana Torres', specialties: ['ACUPUNCTURE'] }])
        : undefined,
    (c: { url: string }) => (c.url === '/api/rooms' ? jsonResponse(200, []) : undefined),
  ]
}

function renderAgenda(roles: Parameters<typeof makeUser>[0] = ['RECEPTION']) {
  const user = makeUser(roles)
  return renderWithAuth(<AgendaWorkspace user={user} />, user, '/agenda?fecha=2026-11-03')
}

describe('AgendaWorkspace', () => {
  it('dibuja la cita en su día con la hora de Lima (09:00, no 14:00) y oculta las canceladas', async () => {
    installFetch(...handlers())
    renderAgenda()
    const block = await screen.findByRole('button', { name: /09:00 a 09:30, Rosa Quispe/ })
    expect(block).toHaveTextContent('09:00')
    expect(screen.queryByRole('button', { name: /Luis Rojas/ })).not.toBeInTheDocument()
    expect(screen.getByText(/1 cancelada\(s\) o ausente\(s\) ocultas/)).toBeInTheDocument()

    const column = screen.getByRole('group', { name: /^Martes 03\/11/ })
    expect(within(column).getByRole('button', { name: /Rosa Quispe/ })).toBeInTheDocument()
  })

  it('«Mostrar canceladas» las incluye, con su estado en el nombre accesible', async () => {
    installFetch(...handlers())
    const user = userEvent.setup()
    renderAgenda()
    await screen.findByRole('button', { name: /Rosa Quispe/ })
    await user.click(screen.getByLabelText('Mostrar canceladas y ausencias'))
    expect(await screen.findByRole('button', { name: /Luis Rojas.*Cancelada/ })).toBeInTheDocument()
  })

  it('consulta el rango de la semana en UTC (lunes 05:00Z a lunes siguiente)', async () => {
    const calls = installFetch(...handlers())
    renderAgenda()
    await screen.findByRole('button', { name: /Rosa Quispe/ })
    const url = calls.find((c) => c.url.startsWith('/api/appointments?'))?.url ?? ''
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('from')).toBe('2026-11-02T05:00:00.000Z')
    expect(params.get('to')).toBe('2026-11-09T05:00:00.000Z')
  })

  it('filtrar por doctor vuelve a consultar con doctor_id', async () => {
    const calls = installFetch(...handlers())
    const user = userEvent.setup()
    renderAgenda()
    await screen.findByRole('button', { name: /Rosa Quispe/ })
    await user.selectOptions(await screen.findByLabelText('Doctor'), 'd-1')
    await waitFor(() => expect(calls.some((c) => c.url.includes('doctor_id=d-1'))).toBe(true))
  })

  it('la vista de lista muestra lo mismo en una tabla accesible y abre el detalle', async () => {
    installFetch(...handlers())
    const user = userEvent.setup()
    renderAgenda()
    await screen.findByRole('button', { name: /Rosa Quispe/ })
    await user.click(screen.getByRole('button', { name: 'Lista' }))
    const table = await screen.findByRole('table', { name: /Citas/ })
    expect(within(table).getByText('09:00–09:30')).toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: /Rosa Quispe/ }))
    expect(await screen.findByRole('dialog', { name: 'Detalle de la cita' })).toBeInTheDocument()
  })

  it('recepción ve «Nueva cita»; un doctor no, ni el filtro de doctor', async () => {
    installFetch(...handlers())
    const { unmount } = renderAgenda(['RECEPTION'])
    expect(await screen.findByRole('button', { name: 'Nueva cita' })).toBeInTheDocument()
    unmount()
    renderAgenda(['DOCTOR'])
    await screen.findByRole('button', { name: /Rosa Quispe/ })
    expect(screen.queryByRole('button', { name: 'Nueva cita' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Doctor')).not.toBeInTheDocument()
    expect(screen.getByText(/Solo se muestran sus citas/)).toBeInTheDocument()
  })
})
