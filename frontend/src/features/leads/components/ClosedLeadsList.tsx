import { useState } from 'react'
import { Link } from 'react-router-dom'

import { formatShortDateTimeLima } from '@/shared/lib/dates'
import { ApiError } from '@/shared/lib/http'
import { LEAD_SOURCE_LABELS, SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { LeadStatus, LeadSummary } from '@/shared/types/aliases'
import { Alert, Badge, Button, Spinner, Table, Td, Th } from '@/shared/ui'

import { useClosedLeads, useMoveLead, type LeadFilters } from '../api/useLeads'

const LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

interface ClosedLeadsListProps {
  status: Extract<LeadStatus, 'LOST' | 'CONVERTED'>
  filters: LeadFilters
  canManage: boolean
  assigneeName: (id: string | null) => string
}

/** Lista de solo consulta de leads Perdidos o Convertidos; un perdido se puede reabrir como Nuevo. */
export function ClosedLeadsList({
  status,
  filters,
  canManage,
  assigneeName,
}: ClosedLeadsListProps) {
  const leads = useClosedLeads(status, filters, true)
  const move = useMoveLead()
  const [error, setError] = useState<string | null>(null)
  const isLost = status === 'LOST'

  function reopen(lead: LeadSummary) {
    setError(null)
    move.mutate(
      { lead, to: 'NEW' },
      {
        onError: (e) => setError(e instanceof ApiError ? e.message : 'No se pudo reabrir el lead.'),
      },
    )
  }

  if (leads.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-slate-600">
        <Spinner /> Cargando…
      </p>
    )
  }
  if (leads.isError) {
    return (
      <Alert tone="error">
        {leads.error instanceof ApiError ? leads.error.message : 'No se pudo cargar la lista.'}
      </Alert>
    )
  }
  if (leads.data.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
        {isLost ? 'No hay leads perdidos.' : 'Aún no hay leads convertidos en pacientes.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Table caption={isLost ? 'Leads perdidos' : 'Leads convertidos'}>
        <thead>
          <tr>
            <Th>Lead</Th>
            <Th>Contacto</Th>
            <Th>Interés</Th>
            <Th>Fuente</Th>
            <Th>Responsable</Th>
            {isLost && <Th>Motivo</Th>}
            <Th>{isLost ? 'Perdido el' : 'Convertido el'}</Th>
            <Th>
              <span className="sr-only">Acciones</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {leads.data.map((lead) => (
            <tr key={lead.id}>
              <Td>
                <Link to={`/leads/${lead.id}`} className={LINK}>
                  {lead.full_name}
                </Link>
              </Td>
              <Td className="whitespace-nowrap">{lead.phone ?? lead.email ?? '—'}</Td>
              <Td>
                <ul className="flex flex-wrap gap-1">
                  {lead.interest_specialties.map((s) => (
                    <li key={s}>
                      <Badge tone="brand">{SPECIALTY_LABELS[s]}</Badge>
                    </li>
                  ))}
                </ul>
              </Td>
              <Td>{LEAD_SOURCE_LABELS[lead.source]}</Td>
              <Td>{lead.assigned_to_name ?? assigneeName(lead.assigned_to)}</Td>
              {isLost && <Td>{lead.lost_reason ?? '—'}</Td>}
              <Td className="whitespace-nowrap">
                {formatShortDateTimeLima(lead.status_changed_at)}
              </Td>
              <Td>
                <div className="flex justify-end gap-2">
                  {isLost && canManage && (
                    <Button
                      variant="secondary"
                      loading={move.isPending && move.variables?.lead.id === lead.id}
                      aria-label={`Reabrir a ${lead.full_name}`}
                      onClick={() => reopen(lead)}
                    >
                      Reabrir
                    </Button>
                  )}
                  {!isLost && lead.converted_patient_id && (
                    <Link to={`/pacientes/${lead.converted_patient_id}`} className={LINK}>
                      Ver paciente
                    </Link>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}
