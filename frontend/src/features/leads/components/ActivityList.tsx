import { formatShortDateTimeLima } from '@/shared/lib/dates'
import { ACTIVITY_TYPE_LABELS } from '@/shared/lib/labels'
import type { LeadActivityRead } from '@/shared/types/aliases'

import { describeActivityNotes } from '../activityText'

/** Historial de actividades, la más reciente primero (como lo entrega el servidor). */
export function ActivityList({ activities }: { activities: readonly LeadActivityRead[] }) {
  return (
    <section
      aria-labelledby="activity-title"
      className="rounded-lg border border-slate-300 bg-white p-5"
    >
      <h2 id="activity-title" className="text-base font-semibold text-slate-900">
        Historial de actividades
      </h2>
      {activities.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">Todavía no hay actividades registradas.</p>
      ) : (
        <ol className="mt-3 flex flex-col divide-y divide-slate-200">
          {activities.map((activity) => {
            const notes = describeActivityNotes(activity.type, activity.notes)
            return (
              <li key={activity.id} className="py-2.5 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={`font-medium ${activity.type === 'STATUS_CHANGE' ? 'text-slate-600' : 'text-slate-900'}`}
                  >
                    {ACTIVITY_TYPE_LABELS[activity.type]}
                  </span>
                  <time dateTime={activity.created_at} className="text-xs text-slate-600">
                    {formatShortDateTimeLima(activity.created_at)}
                  </time>
                </p>
                {notes && <p className="mt-0.5 text-slate-800">{notes}</p>}
                {activity.next_action_at && (
                  <p className="mt-0.5 text-xs text-slate-700">
                    Próxima acción: {formatShortDateTimeLima(activity.next_action_at)}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
