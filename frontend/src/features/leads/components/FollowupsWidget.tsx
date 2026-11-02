import { Link } from 'react-router-dom'

import { useNow } from '@/shared/hooks/useNow'
import { ApiError } from '@/shared/lib/http'
import { LEAD_STATUS_LABELS } from '@/shared/lib/labels'
import { Alert, Spinner } from '@/shared/ui'

import { useFollowups } from '../api/useLeads'
import { NextActionBadge } from './NextActionBadge'

/** "Seguimientos de hoy": leads abiertos con próxima acción vencida o que vence hoy (hora de Lima). */
export function FollowupsWidget() {
  const followups = useFollowups()
  const now = useNow()

  return (
    <section
      aria-labelledby="followups-title"
      className="rounded-xl border border-slate-300 bg-white p-6"
    >
      <h2 id="followups-title" className="text-lg font-semibold text-slate-900">
        Seguimientos de hoy
      </h2>
      {followups.isPending && (
        <p role="status" className="mt-3 flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando seguimientos…
        </p>
      )}
      {followups.isError && (
        <div className="mt-3">
          <Alert tone="error">
            {followups.error instanceof ApiError
              ? followups.error.message
              : 'No se pudieron cargar los seguimientos.'}
          </Alert>
        </div>
      )}
      {followups.data &&
        (followups.data.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No hay seguimientos pendientes para hoy.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {followups.data.map((lead) => (
              <li
                key={lead.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div>
                  <Link
                    to={`/leads/${lead.id}`}
                    className="font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                  >
                    {lead.full_name}
                  </Link>
                  <p className="text-xs text-slate-600">
                    {LEAD_STATUS_LABELS[lead.status]} · {lead.phone ?? lead.email ?? 'Sin contacto'}
                  </p>
                </div>
                <NextActionBadge nextActionAt={lead.next_action_at} now={now} />
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}
