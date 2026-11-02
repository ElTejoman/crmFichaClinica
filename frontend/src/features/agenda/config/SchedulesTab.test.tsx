import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { SchedulesTab } from './SchedulesTab'

afterEach(() => vi.unstubAllGlobals())

const block = {
  id: 'b-1',
  doctor_user_id: 'd-1',
  doctor_name: 'Ana Torres',
  weekday: 0,
  start_time: '09:00:00',
  end_time: '13:00:00',
  slot_minutes: 30,
  valid_from: null,
  valid_to: null,
  is_active: true,
}

function handlers(extra?: Parameters<typeof installFetch>[0]) {
  return [
    ...(extra ? [extra] : []),
    (c: { url: string }) =>
      c.url === '/api/doctors'
        ? jsonResponse(200, [{ id: 'd-1', full_name: 'Ana Torres', specialties: ['ACUPUNCTURE'] }])
        : undefined,
    (c: { url: string; method: string }) =>
      c.method === 'GET' && c.url.startsWith('/api/schedules')
        ? jsonResponse(200, [block])
        : undefined,
  ]
}

async function openNewBlock(user: ReturnType<typeof userEvent.setup>) {
  renderWithAuth(<SchedulesTab />, makeUser(['RECEPTION']))
  await screen.findByRole('option', { name: 'Ana Torres' })
  await user.selectOptions(screen.getByLabelText(/^Doctor/), 'd-1')
  await screen.findByText('09:00–13:00')
  await user.click(screen.getByRole('button', { name: 'Agregar bloque' }))
}

describe('SchedulesTab', () => {
  it('muestra el bloque en su día y permite desactivarlo (no hay borrado)', async () => {
    const calls = installFetch(
      ...handlers((c) =>
        c.method === 'PATCH' ? jsonResponse(200, { ...block, is_active: false }) : undefined,
      ),
    )
    const user = userEvent.setup()
    renderWithAuth(<SchedulesTab />, makeUser(['RECEPTION']))
    await screen.findByRole('option', { name: 'Ana Torres' })
    await user.selectOptions(screen.getByLabelText(/^Doctor/), 'd-1')
    expect(await screen.findByText('09:00–13:00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Desactivar bloque Lunes 09:00/ }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ is_active: false })
  })

  it('409 schedule_overlap: explica el cruce y deja el formulario abierto', async () => {
    installFetch(
      ...handlers((c) =>
        c.method === 'POST' && c.url === '/api/schedules'
          ? jsonResponse(409, {
              error: {
                code: 'schedule_overlap',
                message: 'Se cruza con el bloque 09:00-13:00 del lunes',
              },
            })
          : undefined,
      ),
    )
    const user = userEvent.setup()
    await openNewBlock(user)
    await user.click(screen.getByRole('button', { name: 'Crear bloque' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Se cruza con el bloque 09:00-13:00 del lunes')
    expect(screen.getByRole('form', { name: 'Bloque de horario' })).toBeInTheDocument()
  })

  it('valida en el cliente que la hora de fin sea posterior a la de inicio', async () => {
    const calls = installFetch(...handlers())
    const user = userEvent.setup()
    await openNewBlock(user)
    const end = screen.getByLabelText(/^Hora de fin/)
    await user.clear(end)
    await user.type(end, '08:00')
    await user.click(screen.getByRole('button', { name: 'Crear bloque' }))
    expect(await screen.findByText(/posterior a la de inicio/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('envía el bloque con HH:MM:SS y el doctor elegido', async () => {
    const calls = installFetch(
      ...handlers((c) =>
        c.method === 'POST' && c.url === '/api/schedules' ? jsonResponse(201, block) : undefined,
      ),
    )
    const user = userEvent.setup()
    await openNewBlock(user)
    await user.click(screen.getByRole('button', { name: 'Crear bloque' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      doctor_user_id: 'd-1',
      weekday: 0,
      start_time: '09:00:00',
      end_time: '13:00:00',
      slot_minutes: 30,
    })
  })
})
