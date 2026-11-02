import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppointmentList, AppointmentStatusBadge } from '@/entities/appointment'
import {
  formatDayLong,
  formatShortDateTimeLima,
  formatTimeRangeLima,
  limaDateKeyOf,
} from '@/shared/lib/dates'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { AppointmentRead } from '@/shared/types/aliases'
import { Alert, Button, Dialog, Spinner } from '@/shared/ui'

import { ACTION_LABELS, availableActions, type AppointmentAction, type Viewer } from '../actions'
import { useAppointmentAction, useSeriesAppointments } from '../api/useAppointmentActions'
import { AgendaError } from './AgendaError'
import { CancelAppointmentForm } from './CancelAppointmentForm'
import { RescheduleForm } from './RescheduleForm'

type Mode = 'detail' | 'cancel' | 'reschedule' | 'series'

const SUCCESS_MESSAGES: Record<AppointmentAction, string> = {
  confirm: 'Cita confirmada.',
  'check-in': 'Llegada registrada: el paciente pasa a la cola del doctor.',
  start: 'Atención iniciada.',
  complete: 'Atención completada.',
  reschedule: 'Cita reprogramada.',
  'no-show': 'Ausencia registrada. El horario quedó libre.',
  cancel: 'Cita cancelada. El horario quedó libre.',
}

const TITLES: Record<Mode, string> = {
  detail: 'Detalle de la cita',
  cancel: 'Cancelar cita',
  reschedule: 'Reprogramar cita',
  series: 'Sesiones del paquete',
}

const LINK_CLASS =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  )
}

/** Historial resumido con lo que expone el API (no hay bitácora de estados por cita). */
function historyOf(a: AppointmentRead): string[] {
  const entries = [`Agendada el ${formatShortDateTimeLima(a.created_at)}`]
  if (a.checked_in_at)
    entries.push(`Llegada registrada el ${formatShortDateTimeLima(a.checked_in_at)}`)
  if (a.status === 'CONFIRMED') entries.push('Confirmada')
  if (a.status === 'IN_PROGRESS') entries.push('En atención')
  if (a.status === 'COMPLETED') entries.push('Atención completada')
  if (a.status === 'NO_SHOW') entries.push('Marcada como ausente')
  if (a.status === 'CANCELLED')
    entries.push(`Cancelada${a.cancel_reason ? `: ${a.cancel_reason}` : ''}`)
  return entries
}

interface AppointmentDetailDialogProps {
  appointment: AppointmentRead | null
  viewer: Viewer
  onClose: () => void
}

/**
 * Detalle de la cita con acciones según estado y permiso. Cancelar, reprogramar y ver la serie
 * cambian la vista DENTRO del mismo diálogo (no apilan modales: el foco y Escape siguen simples).
 */
export function AppointmentDetailDialog({
  appointment,
  viewer,
  onClose,
}: AppointmentDetailDialogProps) {
  return (
    <>
      {appointment && (
        // `key` reinicia modo/mensajes al abrir otra cita.
        <DetailBody key={appointment.id} initial={appointment} viewer={viewer} onClose={onClose} />
      )}
    </>
  )
}

function DetailBody({
  initial,
  viewer,
  onClose,
}: {
  initial: AppointmentRead
  viewer: Viewer
  onClose: () => void
}) {
  const [current, setCurrent] = useState(initial)
  const [mode, setMode] = useState<Mode>('detail')
  const [message, setMessage] = useState<string | null>(null)
  const act = useAppointmentAction()
  const bodyRef = useRef<HTMLDivElement>(null)

  // Al cambiar de vista el botón pulsado desaparece: el foco pasa al contenedor nuevo.
  useEffect(() => {
    if (mode !== 'detail') bodyRef.current?.focus()
  }, [mode])

  function run(action: AppointmentAction, body?: Parameters<typeof act.mutate>[0]['body']) {
    setMessage(null)
    act.mutate(
      { id: current.id, action, ...(body ? { body } : {}) },
      {
        onSuccess: (updated) => {
          setCurrent(updated)
          setMode('detail')
          setMessage(SUCCESS_MESSAGES[action])
        },
      },
    )
  }

  const actions = availableActions(current, viewer)
  const summary = `la cita de ${current.patient_name}`
  const dayKey = limaDateKeyOf(current.starts_at)

  return (
    <Dialog open onClose={onClose} title={TITLES[mode]} size={mode === 'reschedule' ? 'xl' : 'lg'}>
      <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-4 focus:outline-none">
        {mode === 'detail' && (
          <>
            <div aria-live="polite" className="empty:hidden">
              {message && <Alert tone="success">{message}</Alert>}
            </div>
            {act.isError && <AgendaError error={act.error} />}
            <dl className="flex flex-col gap-2">
              <Row label="Fecha y hora">
                <span className="inline-block first-letter:uppercase">{formatDayLong(dayKey)}</span>
                , {formatTimeRangeLima(current.starts_at, current.ends_at)} (hora de Lima)
              </Row>
              <Row label="Estado">
                <AppointmentStatusBadge status={current.status} />
              </Row>
              <Row label="Paciente">
                <Link to={`/pacientes/${current.patient_id}`} className={LINK_CLASS}>
                  {current.patient_name}
                </Link>
                {current.patient_phone && <span className="ml-2">{current.patient_phone}</span>}
              </Row>
              <Row label="Doctor">{current.doctor_name}</Row>
              <Row label="Especialidad">
                {SPECIALTY_LABELS[current.specialty]}
                {current.type_name && ` · ${current.type_name}`}
              </Row>
              <Row label="Sala">{current.room_name ?? 'Sin sala'}</Row>
              {current.admin_notes && (
                <Row label="Notas administrativas">{current.admin_notes}</Row>
              )}
              {current.cancel_reason && (
                <Row label="Motivo de cancelación">{current.cancel_reason}</Row>
              )}
            </dl>
            <section aria-label="Historial de la cita">
              <h3 className="text-sm font-semibold text-slate-800">Historial</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                {historyOf(current).map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <Button
                    key={action}
                    variant={
                      action === 'cancel'
                        ? 'danger'
                        : action === 'reschedule' || action === 'no-show'
                          ? 'secondary'
                          : 'primary'
                    }
                    loading={act.isPending && act.variables.action === action}
                    disabled={act.isPending}
                    onClick={() => {
                      if (action === 'cancel') setMode('cancel')
                      else if (action === 'reschedule') setMode('reschedule')
                      else run(action)
                    }}
                  >
                    {ACTION_LABELS[action]}
                  </Button>
                ))}
                {current.series_id && (
                  <Button variant="ghost" onClick={() => setMode('series')}>
                    Ver serie
                  </Button>
                )}
              </div>
              <Button variant="secondary" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </>
        )}
        {mode === 'cancel' && (
          <>
            {act.isError && <AgendaError error={act.error} />}
            <CancelAppointmentForm
              summary={summary}
              loading={act.isPending}
              onBack={() => setMode('detail')}
              onConfirm={(reason) => run('cancel', { reason })}
            />
          </>
        )}
        {mode === 'reschedule' && (
          <RescheduleForm
            appointment={current}
            loading={act.isPending}
            error={act.isError ? act.error : null}
            onBack={() => setMode('detail')}
            onConfirm={(body) => run('reschedule', body)}
          />
        )}
        {mode === 'series' && current.series_id && (
          <SeriesView
            seriesId={current.series_id}
            onBack={() => setMode('detail')}
            onSelect={(appointment) => {
              setCurrent(appointment)
              setMessage(null)
              setMode('detail')
            }}
          />
        )}
      </div>
    </Dialog>
  )
}

function SeriesView({
  seriesId,
  onBack,
  onSelect,
}: {
  seriesId: string
  onBack: () => void
  onSelect: (appointment: AppointmentRead) => void
}) {
  const series = useSeriesAppointments(seriesId)
  return (
    <div className="flex flex-col gap-3">
      {series.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando sesiones…
        </p>
      )}
      {series.isError && <AgendaError error={series.error} />}
      {series.data && (
        <AppointmentList
          appointments={series.data}
          onSelect={onSelect}
          ariaLabel="Sesiones del paquete"
        />
      )}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onBack}>
          Volver al detalle
        </Button>
      </div>
    </div>
  )
}
