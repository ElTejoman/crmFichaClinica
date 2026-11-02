import type { DragEvent } from 'react'
import { Link } from 'react-router-dom'

import { LEAD_SOURCE_LABELS, SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { LeadStatus, LeadSummary } from '@/shared/types/aliases'
import { Badge } from '@/shared/ui'

import { allowedTargets } from '../kanbanRules'
import { MoveMenu } from './MoveMenu'
import { NextActionBadge } from './NextActionBadge'

interface LeadCardProps {
  lead: LeadSummary
  assigneeName: string
  now: Date
  canManage: boolean
  busy: boolean
  onMove: (lead: LeadSummary, to: LeadStatus) => void
  onDragStart: (lead: LeadSummary, event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

/** Tarjeta del tablero: arrastrable con ratón y movible con "Mover a…" desde el teclado. */
export function LeadCard({
  lead,
  assigneeName,
  now,
  canManage,
  busy,
  onMove,
  onDragStart,
  onDragEnd,
}: LeadCardProps) {
  return (
    <article
      draggable={canManage && !busy}
      onDragStart={(event) => onDragStart(lead, event)}
      onDragEnd={onDragEnd}
      aria-busy={busy || undefined}
      className={`flex flex-col gap-2 rounded-lg border border-slate-300 bg-white p-3 shadow-sm ${
        canManage ? 'cursor-grab active:cursor-grabbing' : ''
      } ${busy ? 'opacity-60' : ''}`}
    >
      <Link
        to={`/leads/${lead.id}`}
        draggable={false}
        className="font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        {lead.full_name}
      </Link>
      <p className="text-sm text-slate-700">{lead.phone ?? lead.email ?? 'Sin contacto'}</p>
      {lead.interest_specialties.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Especialidades de interés">
          {lead.interest_specialties.map((specialty) => (
            <li key={specialty}>
              <Badge tone="brand">{SPECIALTY_LABELS[specialty]}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-600">
        {LEAD_SOURCE_LABELS[lead.source]} · Responsable: {assigneeName}
      </p>
      <div>
        <NextActionBadge nextActionAt={lead.next_action_at} now={now} />
      </div>
      {canManage && (
        <MoveMenu
          leadName={lead.full_name}
          targets={allowedTargets(lead.status)}
          disabled={busy}
          onSelect={(to) => onMove(lead, to)}
        />
      )}
    </article>
  )
}
