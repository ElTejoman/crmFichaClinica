import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { ExceptionsTab } from './ExceptionsTab'

afterEach(() => vi.unstubAllGlobals())

function setup(created: unknown) {
  return installFetch(
    (c) =>
      c.method === 'POST' && c.url === '/api/schedule-exceptions'
        ? jsonResponse(201, created)
        : undefined,
    (c) =>
      c.method === 'GET' && c.url.startsWith('/api/schedule-exceptions')
        ? jsonResponse(200, [])
        : undefined,
    (c) =>
      c.url === '/api/doctors'
        ? jsonResponse(200, [{ id: 'd-1', full_name: 'Ana Torres', specialties: ['ACUPUNCTURE'] }])
        : undefined,
  )
}

async function createException(user: ReturnType<typeof userEvent.setup>) {
  renderWithAuth(<ExceptionsTab />, makeUser(['RECEPTION']))
  await user.click(await screen.findByRole('button', { name: 'Nueva excepción' }))
  await user.type(screen.getByLabelText(/^Desde/), '2026-11-10')
  await user.type(screen.getByLabelText(/^Hasta/), '2026-11-10')
  await user.type(screen.getByLabelText(/^Motivo/), 'E2E feriado')
  await user.click(screen.getByRole('button', { name: 'Crear excepción' }))
}

const created = {
  id: 'e-1',
  doctor_user_id: null,
  doctor_name: null,
  start_date: '2026-11-10',
  end_date: '2026-11-10',
  reason: 'E2E feriado',
}

describe('ExceptionsTab', () => {
  it('muestra cuántas citas abiertas quedaron afectadas y enlaza a la agenda del rango', async () => {
    const calls = setup({ ...created, affected_appointments: 3 })
    const user = userEvent.setup()
    await createException(user)
    const notice = await screen.findByText(/Hay 3 citas abiertas/)
    expect(notice).toHaveTextContent('No se cancelaron automáticamente')
    expect(screen.getByRole('link', { name: /Ver la agenda de esas fechas/ })).toHaveAttribute(
      'href',
      '/agenda?fecha=2026-11-10',
    )
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      doctor_user_id: null,
      start_date: '2026-11-10',
      end_date: '2026-11-10',
      reason: 'E2E feriado',
    })
  })

  it('sin citas afectadas lo dice, sin alarmar', async () => {
    setup({ ...created, affected_appointments: 0 })
    const user = userEvent.setup()
    await createException(user)
    expect(await screen.findByText(/No hay citas abiertas en ese rango/)).toBeInTheDocument()
  })

  it('exige el motivo antes de enviar', async () => {
    const calls = setup({ ...created, affected_appointments: 0 })
    const user = userEvent.setup()
    renderWithAuth(<ExceptionsTab />, makeUser(['RECEPTION']))
    await user.click(await screen.findByRole('button', { name: 'Nueva excepción' }))
    await user.type(screen.getByLabelText(/^Desde/), '2026-11-10')
    await user.type(screen.getByLabelText(/^Hasta/), '2026-11-10')
    await user.click(screen.getByRole('button', { name: 'Crear excepción' }))
    expect(await screen.findByText(/Indique el motivo/)).toBeInTheDocument()
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(false))
  })
})
