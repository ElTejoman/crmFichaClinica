import { useState, type DragEvent } from 'react'

import { useNow } from '@/shared/hooks/useNow'
import { ApiError } from '@/shared/lib/http'
import type { LeadStatus, LeadSummary } from '@/shared/types/aliases'
import { Alert, Spinner } from '@/shared/ui'

import { useBoardLeads, useMoveLead, type LeadFilters } from '../api/useLeads'
import { canMove, OPEN_STATUSES, requiresLostReason } from '../kanbanRules'
import { KanbanColumn } from './KanbanColumn'
import { LostReasonDialog } from './LostReasonDialog'

interface KanbanBoardProps {
  filters: LeadFilters
  canManage: boolean
  assigneeName: (id: string | null) => string
}

/**
 * Tablero Kanban de las 4 etapas abiertas. Mover: arrastrar (HTML5 DnD) o "Mover a…" en la
 * tarjeta (teclado). Ambos caminos pasan por `requestMove`, que valida la transición y pide el
 * motivo si el destino es Perdido. El scroll horizontal queda DENTRO del tablero, no de la página.
 */
export function KanbanBoard({ filters, canManage, assigneeName }: KanbanBoardProps) {
  const board = useBoardLeads(filters)
  const move = useMoveLead()
  const [dragging, setDragging] = useState<LeadSummary | null>(null)
  const [lostTarget, setLostTarget] = useState<LeadSummary | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const now = useNow()

  function submitMove(lead: LeadSummary, to: LeadStatus, lostReason?: string) {
    setMoveError(null)
    move.mutate(
      { lead, to, ...(lostReason ? { lostReason } : {}) },
      {
        onError: (error) =>
          setMoveError(error instanceof ApiError ? error.message : 'No se pudo mover el lead.'),
        onSettled: () => setLostTarget(null),
      },
    )
  }

  function requestMove(lead: LeadSummary, to: LeadStatus) {
    if (!canMove(lead.status, to)) return
    if (requiresLostReason(to)) setLostTarget(lead)
    else submitMove(lead, to)
  }

  function onDragStart(lead: LeadSummary, event: DragEvent<HTMLElement>) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', lead.id) // Firefox exige datos para iniciar el arrastre
    setDragging(lead)
  }

  if (board.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-slate-600">
        <Spinner /> Cargando tablero…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {board.error && (
        <Alert tone="error">
          {board.error instanceof ApiError ? board.error.message : 'No se pudo cargar el tablero.'}
        </Alert>
      )}
      {moveError && <Alert tone="error">{moveError}</Alert>}
      {canManage && (
        <p className="text-xs text-slate-600">
          Arrastre una tarjeta a otra columna o use el botón «Mover a…» de la tarjeta.
        </p>
      )}
      <div
        role="region"
        aria-label="Tablero de leads"
        tabIndex={0}
        className="overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        <div className="grid min-w-[60rem] grid-cols-4 gap-3">
          {OPEN_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              leads={board.byStatus[status]}
              assigneeName={assigneeName}
              now={now}
              canManage={canManage}
              movingId={move.isPending ? (move.variables?.lead.id ?? null) : null}
              isDragging={dragging !== null}
              isDropTarget={dragging !== null && canMove(dragging.status, status)}
              onMove={requestMove}
              onDragStart={onDragStart}
              onDragEnd={() => setDragging(null)}
              onDrop={(target) => {
                if (dragging) requestMove(dragging, target)
                setDragging(null)
              }}
            />
          ))}
        </div>
      </div>

      <LostReasonDialog
        leadName={lostTarget?.full_name ?? null}
        loading={move.isPending}
        onCancel={() => setLostTarget(null)}
        onConfirm={(reason) => lostTarget && submitMove(lostTarget, 'LOST', reason)}
      />
    </div>
  )
}
