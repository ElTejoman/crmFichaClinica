import { formatDayShort, formatTimeRangeLima, limaDateKeyOf } from '@/shared/lib/dates'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { AppointmentRead } from '@/shared/types/aliases'

import { AppointmentStatusBadge } from './AppointmentStatusBadge'

interface AppointmentListProps {
  appointments: readonly AppointmentRead[]
  /** Si se pasa, cada cita es un botón (abre el detalle); si no, solo se lista. */
  onSelect?: (appointment: AppointmentRead) => void
  /** Muestra el nombre del paciente (en la ficha del paciente sobra). */
  showPatient?: boolean
  ariaLabel: string
}

const ITEM_FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/** Lista compacta y reutilizable de citas (ficha del paciente, inicio, serie). Hora de Lima. */
export function AppointmentList({
  appointments,
  onSelect,
  showPatient = false,
  ariaLabel,
}: AppointmentListProps) {
  return (
    <ul aria-label={ariaLabel} className="divide-y divide-slate-200">
      {appointments.map((appointment) => {
        const content = (
          <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-0">
              <span className="block font-medium text-slate-900">
                {formatDayShort(limaDateKeyOf(appointment.starts_at))} ·{' '}
                {formatTimeRangeLima(appointment.starts_at, appointment.ends_at)}
              </span>
              <span className="block text-sm text-slate-700">
                {showPatient && `${appointment.patient_name} · `}
                {SPECIALTY_LABELS[appointment.specialty]} · {appointment.doctor_name}
                {appointment.room_name && ` · ${appointment.room_name}`}
              </span>
            </span>
            <AppointmentStatusBadge status={appointment.status} />
          </span>
        )
        return (
          <li key={appointment.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(appointment)}
                className={`block w-full px-1 py-2.5 text-left hover:bg-slate-50 ${ITEM_FOCUS}`}
              >
                {content}
              </button>
            ) : (
              <div className="px-1 py-2.5">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
