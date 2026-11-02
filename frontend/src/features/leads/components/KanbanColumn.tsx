import { useId, type DragEvent } from 'react'

import { LEAD_STATUS_LABELS } from '@/shared/lib/labels'
import type { LeadStatus, LeadSummary } from '@/shared/types/aliases'
import { Badge } from '@/shared/ui'

import { LEADS_COLUMN_LIMIT } from '../api/useLeads'
import { LeadCard } from './LeadCard'

interface KanbanColumnProps {
  status: LeadStatus
  leads: readonly LeadSummary[]
  assigneeName: (id: string | null) => string
  now: Date
  canManage: boolean
  movingId: string | null
  /** ¿Se puede soltar aquí lo que se está arrastrando? Resalta las columnas válidas. */
  isDropTarget: boolean
  isDragging: boolean
  onMove: (lead: LeadSummary, to: LeadStatus) => void
  onDragStart: (lead: LeadSummary, event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDrop: (status: LeadStatus) => void
}

export function KanbanColumn({
  status,
  leads,
  assigneeName,
  now,
  canManage,
  movingId,
  isDropTarget,
  isDragging,
  onMove,
  onDragStart,
  onDragEnd,
  onDrop,
}: KanbanColumnProps) {
  const titleId = useId()
  const highlight = isDragging && isDropTarget

  return (
    <section
      aria-labelledby={titleId}
      onDragOver={(event) => {
        if (isDropTarget) event.preventDefault() // sin esto el navegador no permite soltar
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (isDropTarget) onDrop(status)
      }}
      className={`flex min-h-48 flex-col gap-3 rounded-xl border p-3 ${
        highlight
          ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500/40'
          : 'border-slate-300 bg-slate-100'
      } ${isDragging && !isDropTarget ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-sm font-semibold text-slate-900">
          {LEAD_STATUS_LABELS[status]}
        </h2>
        <Badge tone="neutral">{leads.length}</Badge>
      </div>
      {leads.length >= LEADS_COLUMN_LIMIT && (
        <p className="text-xs text-amber-900">
          Se muestran los primeros {LEADS_COLUMN_LIMIT}. Use los filtros para acotar.
        </p>
      )}
      <ul
        className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto"
        aria-label={LEAD_STATUS_LABELS[status]}
      >
        {leads.map((lead) => (
          <li key={lead.id}>
            <LeadCard
              lead={lead}
              assigneeName={lead.assigned_to_name ?? assigneeName(lead.assigned_to)}
              now={now}
              canManage={canManage}
              busy={movingId === lead.id}
              onMove={onMove}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          </li>
        ))}
        {leads.length === 0 && (
          <li className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
            Sin leads en esta etapa.
          </li>
        )}
      </ul>
    </section>
  )
}
