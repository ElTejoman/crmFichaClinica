import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { ActivityForm } from './ActivityForm'

afterEach(() => vi.unstubAllGlobals())

const leadRead = { id: 'lead-1', activities: [] }

describe('ActivityForm', () => {
  it('envía la próxima acción como ISO con zona (el servidor rechaza fechas ambiguas)', async () => {
    const calls = installFetch((c) =>
      c.method === 'POST' && c.url === '/api/leads/lead-1/activities'
        ? jsonResponse(201, leadRead)
        : undefined,
    )
    const user = userEvent.setup()
    renderWithAuth(<ActivityForm leadId="lead-1" />, makeUser(['RECEPTION']))

    await user.selectOptions(screen.getByLabelText(/^Tipo/), 'WHATSAPP')
    await user.type(screen.getByLabelText('Notas'), 'Pidió precios')
    await user.type(screen.getByLabelText('Próxima acción'), '2026-03-12T09:30')
    await user.click(screen.getByRole('button', { name: 'Registrar actividad' }))

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const body = calls.find((c) => c.method === 'POST')?.body as Record<string, string>
    expect(body.type).toBe('WHATSAPP')
    expect(body.notes).toBe('Pidió precios')
    expect(body.next_action_at).toMatch(/Z$/)
    expect(new Date(body.next_action_at ?? '').getTime()).toBe(
      new Date('2026-03-12T09:30').getTime(),
    )
  })

  it('sin próxima acción envía null (limpia el pendiente anterior)', async () => {
    const calls = installFetch((c) =>
      c.method === 'POST' ? jsonResponse(201, leadRead) : undefined,
    )
    const user = userEvent.setup()
    renderWithAuth(<ActivityForm leadId="lead-1" />, makeUser(['RECEPTION']))
    await user.click(screen.getByRole('button', { name: 'Registrar actividad' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      type: 'CALL',
      notes: null,
      next_action_at: null,
    })
  })

  it('muestra el error del servidor de forma legible', async () => {
    installFetch(() =>
      jsonResponse(422, {
        error: { code: 'business_rule_violation', message: 'El lead ya es paciente' },
      }),
    )
    const user = userEvent.setup()
    renderWithAuth(<ActivityForm leadId="lead-1" />, makeUser(['RECEPTION']))
    await user.click(screen.getByRole('button', { name: 'Registrar actividad' }))
    expect(await screen.findByText('El lead ya es paciente')).toBeInTheDocument()
  })
})
