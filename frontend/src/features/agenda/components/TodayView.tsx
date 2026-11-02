import { useState } from 'react'

import { AppointmentStatusBadge, isReleased, useDayAppointments } from '@/entities/appointment'
import { useNow } from '@/shared/hooks/useNow'
import {
  addDaysToKey,
  formatDayLong,
  formatTimeLima,
  formatTimeRangeLima,
  todayLimaKey,
} from '@/shared/lib/dates'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { AppointmentRead, UserRead } from '@/shared/types/aliases'
import { Alert, Button, Dialog, Spinner, Table, Td, Th } from '@/shared/ui'

import { availableActions, type AppointmentAction } from '../actions'
import { useAppointmentAction } from '../api/useAppointmentActions'
import { buildReminderMessage, buildWhatsAppUrl } from '../reminder'
import { AgendaError } from './AgendaError'
import { AppointmentDetailDialog } from './AppointmentDetailDialog'
import { CancelAppointmentForm } from './CancelAppointmentForm'

const QUICK_ACTIONS: readonly AppointmentAction[] = ['confirm', 'check-in', 'cancel']
const QUICK_LABELS: Record<string, string> = {
  confirm: 'Confirmar',
  'check-in': 'Llegó',
  cancel: 'Cancelar',
}
const COPIED_MESSAGE_MS = 3000
const LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/** Copia al portapapeles; si el navegador lo impide (http, permisos) devuelve false. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** «Hoy» para recepción: lista del día con acciones rápidas + citas de mañana para recordar a mano. */
export function TodayView({ user }: { user: UserRead }) {
  const now = useNow()
  const todayKey = todayLimaKey(now)
  const tomorrowKey = addDaysToKey(todayKey, 1)
  const viewer = { id: user.id, roles: user.roles }
  const today = useDayAppointments(todayKey)
  const tomorrow = useDayAppointments(tomorrowKey)
  const act = useAppointmentAction()
  const [selected, setSelected] = useState<AppointmentRead | null>(null)
  const [cancelling, setCancelling] = useState<AppointmentRead | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  function quick(appointment: AppointmentRead, action: AppointmentAction) {
    if (action === 'cancel') {
      act.reset()
      setCancelling(appointment)
      return
    }
    setMessage(null)
    act.mutate(
      { id: appointment.id, action },
      {
        onSuccess: () =>
          setMessage(
            action === 'confirm'
              ? `Cita de ${appointment.patient_name} confirmada.`
              : `Llegada de ${appointment.patient_name} registrada.`,
          ),
      },
    )
  }

  async function copyPhone(appointment: AppointmentRead) {
    if (!appointment.patient_phone) return
    const ok = await copyText(appointment.patient_phone)
    setCopied(
      ok ? `Teléfono de ${appointment.patient_name} copiado.` : 'No se pudo copiar el teléfono.',
    )
    setTimeout(() => setCopied(null), COPIED_MESSAGE_MS)
  }

  const todayRows = (today.data ?? []).filter((a) => !isReleased(a.status))
  const reminders = (tomorrow.data ?? []).filter(
    (a) => a.status === 'SCHEDULED' || a.status === 'CONFIRMED',
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hoy</h1>
        <p className="text-sm text-slate-600 first-letter:uppercase">
          {formatDayLong(todayKey)} · hora de Lima
        </p>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {message && <Alert tone="success">{message}</Alert>}
      </div>
      {act.isError && !cancelling && <AgendaError error={act.error} />}

      <section aria-labelledby="today-title" className="flex flex-col gap-3">
        <h2 id="today-title" className="text-lg font-semibold text-slate-900">
          Citas de hoy
        </h2>
        {today.isPending && (
          <p role="status" className="flex items-center gap-2 text-slate-600">
            <Spinner /> Cargando citas…
          </p>
        )}
        {today.isError && <AgendaError error={today.error} />}
        {today.data &&
          (todayRows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
              No hay citas activas para hoy.
            </p>
          ) : (
            <Table caption="Citas de hoy">
              <thead>
                <tr>
                  <Th>Hora</Th>
                  <Th>Paciente</Th>
                  <Th>Doctor</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {todayRows.map((appointment) => {
                  const offered = availableActions(appointment, viewer).filter((a) =>
                    QUICK_ACTIONS.includes(a),
                  )
                  return (
                    <tr key={appointment.id}>
                      <Td className="whitespace-nowrap">
                        {formatTimeRangeLima(appointment.starts_at, appointment.ends_at)}
                      </Td>
                      <Td>
                        <button
                          type="button"
                          className={LINK}
                          onClick={() => setSelected(appointment)}
                        >
                          {appointment.patient_name}
                          <span className="sr-only">, ver detalle de la cita</span>
                        </button>
                        <span className="block text-xs text-slate-600">
                          {SPECIALTY_LABELS[appointment.specialty]}
                          {appointment.type_name && ` · ${appointment.type_name}`}
                        </span>
                      </Td>
                      <Td>{appointment.doctor_name}</Td>
                      <Td>
                        <AppointmentStatusBadge status={appointment.status} />
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {offered.map((action) => (
                            <Button
                              key={action}
                              variant={action === 'cancel' ? 'secondary' : 'primary'}
                              className="min-h-9 px-3 py-1"
                              disabled={act.isPending}
                              aria-label={`${QUICK_LABELS[action]}: ${appointment.patient_name}`}
                              onClick={() => quick(appointment, action)}
                            >
                              {QUICK_LABELS[action]}
                            </Button>
                          ))}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          ))}
      </section>

      <section aria-labelledby="tomorrow-title" className="flex flex-col gap-3">
        <div>
          <h2 id="tomorrow-title" className="text-lg font-semibold text-slate-900">
            Citas de mañana
          </h2>
          <p className="text-sm text-slate-600">
            Recordatorios manuales: el mensaje no incluye datos clínicos. No se envía nada de forma
            automática.
          </p>
        </div>
        <div aria-live="polite" className="empty:hidden">
          {copied && <Alert tone="info">{copied}</Alert>}
        </div>
        {tomorrow.isPending && (
          <p role="status" className="flex items-center gap-2 text-slate-600">
            <Spinner /> Cargando citas de mañana…
          </p>
        )}
        {tomorrow.isError && <AgendaError error={tomorrow.error} />}
        {tomorrow.data &&
          (reminders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
              No hay citas por recordar para mañana.
            </p>
          ) : (
            <Table caption="Citas de mañana para recordatorio">
              <thead>
                <tr>
                  <Th>Hora</Th>
                  <Th>Paciente</Th>
                  <Th>Doctor</Th>
                  <Th>Teléfono</Th>
                  <Th>Recordatorio</Th>
                </tr>
              </thead>
              <tbody>
                {reminders.map((appointment) => {
                  const url = buildWhatsAppUrl(
                    appointment.patient_phone,
                    buildReminderMessage(appointment),
                  )
                  return (
                    <tr key={appointment.id}>
                      <Td className="whitespace-nowrap">{formatTimeLima(appointment.starts_at)}</Td>
                      <Td>{appointment.patient_name}</Td>
                      <Td>{appointment.doctor_name}</Td>
                      <Td className="whitespace-nowrap">
                        {appointment.patient_phone ?? 'Sin teléfono'}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Abrir WhatsApp para recordar a ${appointment.patient_name}`}
                              className="inline-flex min-h-9 items-center rounded-md bg-brand-700 px-3 py-1 text-sm font-medium text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                            >
                              Abrir WhatsApp
                            </a>
                          ) : null}
                          {appointment.patient_phone && (
                            <Button
                              variant="secondary"
                              className="min-h-9 px-3 py-1"
                              aria-label={`Copiar teléfono de ${appointment.patient_name}`}
                              onClick={() => void copyPhone(appointment)}
                            >
                              Copiar teléfono
                            </Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          ))}
      </section>

      <AppointmentDetailDialog
        appointment={selected}
        viewer={viewer}
        onClose={() => setSelected(null)}
      />
      <Dialog open={cancelling !== null} onClose={() => setCancelling(null)} title="Cancelar cita">
        {cancelling && (
          <div className="flex flex-col gap-4">
            {act.isError && <AgendaError error={act.error} />}
            <CancelAppointmentForm
              summary={`la cita de ${cancelling.patient_name} (${formatTimeLima(cancelling.starts_at)})`}
              loading={act.isPending}
              onBack={() => setCancelling(null)}
              onConfirm={(reason) =>
                act.mutate(
                  { id: cancelling.id, action: 'cancel', body: { reason } },
                  {
                    onSuccess: () => {
                      setMessage(
                        `Cita de ${cancelling.patient_name} cancelada. El horario quedó libre.`,
                      )
                      setCancelling(null)
                    },
                  },
                )
              }
            />
          </div>
        )}
      </Dialog>
    </div>
  )
}
