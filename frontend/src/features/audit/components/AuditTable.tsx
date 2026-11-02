import { formatDateTimeLima } from '@/shared/lib/dates'
import { roleLabel } from '@/shared/lib/labels'
import type { AuditLogRead } from '@/shared/types/aliases'
import { Badge, Table, Td, Th } from '@/shared/ui'

import { actionLabel, outcomeView } from '../labels'

const SHORT_ID_LENGTH = 8

/** `actor_roles` llega como "OWNER,DOCTOR"; se traduce cada rol. */
function actorRolesText(roles: string | null): string {
  return roles ? roles.split(',').map(roleLabel).join(', ') : '—'
}

export function AuditTable({ events }: { events: readonly AuditLogRead[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
        No hay eventos para este filtro.
      </p>
    )
  }
  return (
    <Table caption="Eventos de auditoría, del más reciente al más antiguo">
      <thead>
        <tr>
          <Th>N.º</Th>
          <Th>Fecha (Lima)</Th>
          <Th>Acción</Th>
          <Th>Resultado</Th>
          <Th>Actor</Th>
          <Th>Recurso</Th>
          <Th>Detalle</Th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => {
          const outcome = outcomeView(event.outcome)
          return (
            <tr key={event.id}>
              <Td className="tabular-nums">{event.id}</Td>
              <Td className="whitespace-nowrap">{formatDateTimeLima(event.ts)}</Td>
              <Td className="font-medium">{actionLabel(event.action)}</Td>
              <Td>
                <Badge tone={outcome.tone} icon={outcome.icon}>
                  {outcome.label}
                </Badge>
              </Td>
              <Td>
                <div>{actorRolesText(event.actor_roles)}</div>
                {event.actor_user_id && (
                  <div className="font-mono text-xs text-slate-600" title={event.actor_user_id}>
                    {event.actor_user_id.slice(0, SHORT_ID_LENGTH)}
                  </div>
                )}
              </Td>
              <Td>
                {event.resource_type ?? '—'}
                {event.resource_id && (
                  <div className="font-mono text-xs text-slate-600" title={event.resource_id}>
                    {event.resource_id.slice(0, SHORT_ID_LENGTH)}
                  </div>
                )}
              </Td>
              <Td className="max-w-xs break-words">{event.reason ?? '—'}</Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}
