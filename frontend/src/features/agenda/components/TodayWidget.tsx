import { Link } from 'react-router-dom'

import { AppointmentList, isOpen, useDayAppointments } from '@/entities/appointment'
import { useNow } from '@/shared/hooks/useNow'
import { todayLimaKey } from '@/shared/lib/dates'
import { ApiError } from '@/shared/lib/http'
import { ALL_APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABELS } from '@/shared/lib/labels'
import { Alert, Spinner } from '@/shared/ui'

const UPCOMING_COUNT = 3

/** «Citas de hoy» para el inicio: conteo por estado y las próximas 3 pendientes. */
export function TodayWidget() {
  const now = useNow()
  const today = useDayAppointments(todayLimaKey(now))
  const appointments = today.data ?? []
  const counts = ALL_APPOINTMENT_STATUSES.map((status) => ({
    status,
    total: appointments.filter((a) => a.status === status).length,
  })).filter((c) => c.total > 0)
  const upcoming = appointments
    .filter((a) => isOpen(a.status) && Date.parse(a.ends_at) >= now.getTime())
    .slice(0, UPCOMING_COUNT)

  return (
    <section
      aria-labelledby="today-widget-title"
      className="rounded-xl border border-slate-300 bg-white p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-widget-title" className="text-lg font-semibold text-slate-900">
          Citas de hoy
        </h2>
        <Link
          to="/agenda"
          className="text-sm font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          Abrir agenda
        </Link>
      </div>
      {today.isPending && (
        <p role="status" className="mt-3 flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando citas…
        </p>
      )}
      {today.isError && (
        <div className="mt-3">
          <Alert tone="error">
            {today.error instanceof ApiError
              ? today.error.message
              : 'No se pudieron cargar las citas.'}
          </Alert>
        </div>
      )}
      {today.data &&
        (appointments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No hay citas para hoy.</p>
        ) : (
          <>
            <ul aria-label="Citas de hoy por estado" className="mt-3 flex flex-wrap gap-2">
              {counts.map(({ status, total }) => (
                <li
                  key={status}
                  className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm"
                >
                  <span className="font-semibold text-slate-900">{total}</span>{' '}
                  <span className="text-slate-700">{APPOINTMENT_STATUS_LABELS[status]}</span>
                </li>
              ))}
            </ul>
            <h3 className="mt-4 text-sm font-semibold text-slate-800">Próximas</h3>
            {upcoming.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">No quedan citas pendientes hoy.</p>
            ) : (
              <AppointmentList
                appointments={upcoming}
                showPatient
                ariaLabel="Próximas citas de hoy"
              />
            )}
          </>
        ))}
    </section>
  )
}
