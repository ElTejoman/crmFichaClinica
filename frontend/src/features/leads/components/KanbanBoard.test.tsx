import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'
import type { LeadSummary } from '@/shared/types/aliases'

import { EMPTY_FILTERS } from '../api/useLeads'
import { KanbanBoard } from './KanbanBoard'

const lead: LeadSummary = {
  id: 'lead-1',
  full_name: 'Ana Soto',
  phone: '+51900001111',
  email: null,
  interest_specialties: ['NUTRITION'],
  source: 'INSTAGRAM',
  status: 'NEW',
  status_changed_at: '2026-03-10T15:00:00Z',
  next_action_at: '2020-01-01T10:00:00Z',
  assigned_to: null,
  assigned_to_name: null,
  lost_reason: null,
  consent_marketing: false,
  converted_patient_id: null,
  updated_at: '2026-03-10T15:00:00Z',
}

function boardApi(onPatch?: (body: unknown) => Response) {
  return installFetch((call) => {
    if (call.method === 'GET' && call.url.startsWith('/api/leads?')) {
      const status = new URL(call.url, 'http://x').searchParams.get('status')
      return jsonResponse(200, status === 'NEW' ? [lead] : [])
    }
    if (call.method === 'PATCH' && call.url === '/api/leads/lead-1') {
      return onPatch?.(call.body) ?? jsonResponse(200, { ...lead, status: 'CONTACTED' })
    }
    return undefined
  })
}

function renderBoard(canManage = true) {
  return renderWithAuth(
    <KanbanBoard
      filters={EMPTY_FILTERS}
      canManage={canManage}
      assigneeName={() => 'Sin asignar'}
    />,
    makeUser(['RECEPTION']),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('KanbanBoard', () => {
  it('muestra las 4 columnas abiertas y la tarjeta con su indicador de acción vencida', async () => {
    boardApi()
    renderBoard()
    const newColumn = await screen.findByRole('region', { name: 'Nuevo' })
    expect(within(newColumn).getByRole('link', { name: 'Ana Soto' })).toBeInTheDocument()
    expect(within(newColumn).getByText(/^Vencida/)).toBeInTheDocument()
    for (const name of ['Contactado', 'Calificado', 'Cita agendada']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
  })

  it('"Mover a…" con teclado envía el PATCH correcto {status}', async () => {
    const calls = boardApi()
    const user = userEvent.setup()
    renderBoard()
    await screen.findByRole('link', { name: 'Ana Soto' })

    await user.click(screen.getByRole('button', { name: 'Mover a… Ana Soto' }))
    // Desde NEW no se ofrece NEW ni Convertido; sí las demás etapas abiertas y Perdido.
    const items = screen.getAllByRole('button').map((b) => b.textContent)
    expect(items).toEqual(
      expect.arrayContaining(['Contactado', 'Calificado', 'Cita agendada', 'Perdido']),
    )
    expect(items).not.toContain('Convertido')

    await user.click(screen.getByRole('button', { name: 'Contactado' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch?.url).toBe('/api/leads/lead-1')
    expect(patch?.body).toEqual({ status: 'CONTACTED' })
  })

  it('mover a Perdido pide el motivo y lo envía en lost_reason', async () => {
    const calls = boardApi()
    const user = userEvent.setup()
    renderBoard()
    await screen.findByRole('link', { name: 'Ana Soto' })

    await user.click(screen.getByRole('button', { name: 'Mover a… Ana Soto' }))
    await user.click(screen.getByRole('button', { name: 'Perdido' }))
    const dialog = await screen.findByRole('dialog', { name: 'Marcar como perdido' })
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false) // aún no se envió

    await user.type(within(dialog).getByLabelText(/Motivo de pérdida/), 'Precio')
    await user.click(within(dialog).getByRole('button', { name: 'Marcar como perdido' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      status: 'LOST',
      lost_reason: 'Precio',
    })
  })

  it('si el servidor rechaza el cambio, la tarjeta vuelve y se muestra el motivo legible', async () => {
    boardApi(() =>
      jsonResponse(422, {
        error: {
          code: 'invalid_lead_transition',
          message: 'Un lead perdido solo puede reabrirse como NUEVO',
        },
      }),
    )
    const user = userEvent.setup()
    renderBoard()
    await screen.findByRole('link', { name: 'Ana Soto' })
    await user.click(screen.getByRole('button', { name: 'Mover a… Ana Soto' }))
    await user.click(screen.getByRole('button', { name: 'Contactado' }))

    expect(
      await screen.findByText('Un lead perdido solo puede reabrirse como NUEVO'),
    ).toBeInTheDocument()
    const newColumn = screen.getByRole('region', { name: 'Nuevo' })
    await waitFor(() =>
      expect(within(newColumn).getByRole('link', { name: 'Ana Soto' })).toBeInTheDocument(),
    )
  })

  it('sin permiso de gestión no hay "Mover a…" ni tarjetas arrastrables', async () => {
    boardApi()
    renderBoard(false)
    const link = await screen.findByRole('link', { name: 'Ana Soto' })
    expect(screen.queryByRole('button', { name: /Mover a…/ })).not.toBeInTheDocument()
    expect(link.closest('article')).toHaveAttribute('draggable', 'false')
  })
})
