import { screen } from '@testing-library/react'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'
import type { LeadSummary } from '@/shared/types/aliases'

import { EMPTY_FILTERS } from '../api/useLeads'
import { ClosedLeadsList } from './ClosedLeadsList'

const lost: LeadSummary = {
  id: 'lead-9',
  full_name: 'Luis Ríos',
  phone: '+51900002222',
  email: null,
  interest_specialties: ['DENTISTRY'],
  source: 'WEB',
  status: 'LOST',
  status_changed_at: '2026-03-10T15:00:00Z',
  next_action_at: null,
  assigned_to: 'user-7',
  assigned_to_name: 'Marisol Rojas',
  lost_reason: 'Precio',
  consent_marketing: false,
  converted_patient_id: null,
  updated_at: '2026-03-10T15:00:00Z',
}

afterEach(() => vi.unstubAllGlobals())

function render(status: 'LOST' | 'CONVERTED', rows: LeadSummary[]) {
  installFetch((call) =>
    call.method === 'GET' && call.url.startsWith('/api/leads?')
      ? jsonResponse(200, rows)
      : undefined,
  )
  return renderWithAuth(
    <ClosedLeadsList
      status={status}
      filters={EMPTY_FILTERS}
      canManage
      // El respaldo NO debe usarse cuando el API ya trae el nombre.
      assigneeName={() => 'Otro responsable'}
    />,
    makeUser(['RECEPTION']),
  )
}

describe('ClosedLeadsList', () => {
  it('en Perdidos muestra el motivo y el nombre real del responsable', async () => {
    render('LOST', [lost])
    expect(await screen.findByRole('columnheader', { name: 'Motivo' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Precio' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Marisol Rojas' })).toBeInTheDocument()
    expect(screen.queryByText('Otro responsable')).not.toBeInTheDocument()
  })

  it('en Convertidos no hay columna de motivo', async () => {
    render('CONVERTED', [{ ...lost, status: 'CONVERTED', lost_reason: null }])
    await screen.findByRole('link', { name: 'Luis Ríos' })
    expect(screen.queryByRole('columnheader', { name: 'Motivo' })).not.toBeInTheDocument()
  })

  it('si el API no trae el nombre se usa el respaldo del directorio', async () => {
    render('LOST', [{ ...lost, assigned_to_name: null }])
    expect(await screen.findByRole('cell', { name: 'Otro responsable' })).toBeInTheDocument()
  })
})
