import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AppointmentStatusBadge, useDayAppointments } from '@/entities/appointment'
import { useNow } from '@/shared/hooks/useNow'
import {
  formatDayLong,
  formatTimeLima,
  formatTimeRangeLima,
  todayLimaKey,
} from '@/shared/lib/dates'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { AppointmentRead, UserRead } from '@/shared/types/aliases'
import { Alert, Button, Spinner } from '@/shared/ui'

import { ACTION_LABELS, availableActions, type AppointmentAction } from '../actions'
import { useAppointmentAction } from '../api/useAppointmentActions'
import { splitDoctorDay } from '../doctorDay'
import { AgendaError } from './AgendaError'
import { AppointmentDetailDialog } from './AppointmentDetailDialog'

const REFRESH_MS = 30_000
const LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/** Acción clínica que otra parte de la app inyecta en la cita (la agenda no importa features clínicas). */
type ClinicalActionRenderer = (appointment: AppointmentRead) => ReactNode

function AppointmentCard({
  appointment,
  highlight,
  user,
  onSelect,
  onAct,
  pendingId,
  renderClinicalAction,
}: {
  appointment: AppointmentRead
  highlight?: boolean
  user: UserRead
  onSelect: (a: AppointmentRead) => void
  onAct: (a: AppointmentRead, action: AppointmentAction) => void
  pendingId: string | null
  renderClinicalAction?: ClinicalActionRenderer | undefined
}) {
  // Con ficha clínica disponible, «Iniciar atención» ES abrir el encuentro (que además pasa la
  // cita a «en atención»): el botón de iniciar a secas se oculta para no ofrecer dos caminos.
  const clinicalAction = renderClinicalAction?.(appointment)
  const actions = availableActions(appointment, { id: user.id, roles: user.roles }).filter(
    (a) => (a === 'start' && !clinicalAction) || a === 'complete',
  )
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
        highlight ? 'border-amber-500 bg-amber-50' : 'border-slate-300 bg-white'
      }`}
    >
      <div className="min-w-0">
        <p className="font-medium text-slate-900">
          {formatTimeRangeLima(appointment.starts_at, appointment.ends_at)} ·{' '}
          <button type="button" className={LINK} onClick={() => onSelect(appointment)}>
            {appointment.patient_name}
            <span className="sr-only">, ver detalle de la cita</span>
          </button>
        </p>
        <p className="text-sm text-slate-700">
          {SPECIALTY_LABELS[appointment.specialty]}
          {appointment.type_name && ` · ${appointment.type_name}`}
          {appointment.room_name && ` · ${appointment.room_name}`}
        </p>
        {appointment.checked_in_at && appointment.status === 'CHECKED_IN' && (
          <p className="text-sm text-amber-900">
            Llegó a las {formatTimeLima(appointment.checked_in_at)}
          </p>
        )}
        <Link to={`/pacientes/${appointment.patient_id}`} className={`${LINK} text-sm`}>
          Ficha administrativa
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AppointmentStatusBadge status={appointment.status} />
        {clinicalAction}
        {actions.map((action) => (
          <Button
            key={action}
            loading={pendingId === appointment.id}
            disabled={pendingId !== null}
            aria-label={`${ACTION_LABELS[action]}: ${appointment.patient_name}`}
            onClick={() => onAct(appointment, action)}
          >
            {action === 'start' ? 'Iniciar' : 'Completar'}
          </Button>
        ))}
      </div>
    </li>
  )
}

/** «Mi agenda»: las citas de hoy del doctor, con la cola de espera (ya llegaron) al frente. */
export function MyAgendaView({
  user,
  renderClinicalAction,
}: {
  user: UserRead
  /**
   * Devuelve el botón para abrir la ficha clínica de una cita (o null si no corresponde).
   * Lo aporta la página: así la agenda no depende de la feature clínica.
   */
  renderClinicalAction?: ClinicalActionRenderer
}) {
  const now = useNow()
  const todayKey = todayLimaKey(now)
  // La cola cambia desde recepción (check-in): se refresca sola cada 30 s.
  const day = useDayAppointments(todayKey, { doctorId: user.id }, { refetchIntervalMs: REFRESH_MS })
  const act = useAppointmentAction()
  const [selected, setSelected] = useState<AppointmentRead | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function onAct(appointment: AppointmentRead, action: AppointmentAction) {
    setMessage(null)
    act.mutate(
      { id: appointment.id, action },
      {
        onSuccess: () =>
          setMessage(
            action === 'start'
              ? `Atención de ${appointment.patient_name} iniciada.`
              : `Atención de ${appointment.patient_name} completada.`,
          ),
      },
    )
  }

  const { inProgress, queue, rest } = splitDoctorDay(day.data ?? [])
  const pendingId = act.isPending ? act.variables.id : null

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Mi agenda</h1>
        <p className="text-sm text-slate-600 first-letter:uppercase">
          {formatDayLong(todayKey)} · hora de Lima
        </p>
      </div>
      <Alert tone="info">
        Desde aquí se atiende la cola del día.
        {renderClinicalAction
          ? ' «Iniciar atención» abre la ficha clínica del encuentro.'
          : ' El enlace de cada paciente lleva a su ficha administrativa.'}
      </Alert>
      <div aria-live="polite" className="empty:hidden">
        {message && <Alert tone="success">{message}</Alert>}
      </div>
      {act.isError && <AgendaError error={act.error} />}
      {day.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando su agenda…
        </p>
      )}
      {day.isError && <AgendaError error={day.error} />}
      {day.data && day.data.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
          No tiene citas para hoy.
        </p>
      )}

      {inProgress.length > 0 && (
        <section aria-labelledby="inprogress-title" className="flex flex-col gap-2">
          <h2 id="inprogress-title" className="text-lg font-semibold text-slate-900">
            En atención
          </h2>
          <ul className="flex flex-col gap-2">
            {inProgress.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                user={user}
                onSelect={setSelected}
                onAct={onAct}
                pendingId={pendingId}
                renderClinicalAction={renderClinicalAction}
              />
            ))}
          </ul>
        </section>
      )}

      {day.data && day.data.length > 0 && (
        <section aria-labelledby="queue-title" className="flex flex-col gap-2">
          <h2 id="queue-title" className="text-lg font-semibold text-slate-900">
            Cola de espera ({queue.length})
          </h2>
          {queue.length === 0 ? (
            <p className="text-sm text-slate-600">
              Ningún paciente ha registrado su llegada todavía.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {queue.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  highlight
                  user={user}
                  onSelect={setSelected}
                  onAct={onAct}
                  pendingId={pendingId}
                  renderClinicalAction={renderClinicalAction}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="rest-title" className="flex flex-col gap-2">
          <h2 id="rest-title" className="text-lg font-semibold text-slate-900">
            Resto del día
          </h2>
          <ul className="flex flex-col gap-2">
            {rest.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                user={user}
                onSelect={setSelected}
                onAct={onAct}
                pendingId={pendingId}
                renderClinicalAction={renderClinicalAction}
              />
            ))}
          </ul>
        </section>
      )}

      <AppointmentDetailDialog
        appointment={selected}
        viewer={{ id: user.id, roles: user.roles }}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
