import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import { isReleased } from '@/entities/appointment'
import { useAppointments, APPOINTMENTS_MAX_LIMIT } from '@/entities/appointment'
import { can } from '@/entities/user'
import { todayLimaKey } from '@/shared/lib/dates'
import { readFlash } from '@/shared/lib/flash'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { AppointmentRead, UserRead } from '@/shared/types/aliases'
import { Alert, Spinner } from '@/shared/ui'
import { useNow } from '@/shared/hooks/useNow'

import {
  parseAgendaParams,
  periodTitle,
  shiftDate,
  toAgendaSearch,
  visibleDayKeys,
  visibleRange,
  type AgendaParams,
} from '../agendaParams'
import { limaDateKeyOf } from '@/shared/lib/dates'
import { AgendaError } from './AgendaError'
import { AgendaFilters } from './AgendaFilters'
import { AgendaToolbar } from './AgendaToolbar'
import { AppointmentDetailDialog } from './AppointmentDetailDialog'
import { AppointmentsListView } from './AppointmentsListView'
import { CalendarGrid } from './CalendarGrid'
import type { BookingPrefill, BookingResult } from './BookingWizard'
import { NewAppointmentDialog } from './NewAppointmentDialog'

const BUTTON_LINK =
  'inline-flex min-h-10 items-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/** Pantalla principal de la agenda: calendario semanal/día o lista, filtros y detalle de cita. */
export function AgendaWorkspace({ user }: { user: UserRead }) {
  const now = useNow()
  const todayKey = todayLimaKey(now)
  const [search, setSearch] = useSearchParams()
  const location = useLocation()
  const params = parseAgendaParams(search, todayKey)
  const canManage = can(user.roles, 'agenda:manage')
  const isDoctorOnly = !canManage && user.roles.includes('DOCTOR')
  const [selected, setSelected] = useState<AppointmentRead | null>(null)
  const [booking, setBooking] = useState<{ prefill?: BookingPrefill } | null>(null)
  const [message, setMessage] = useState<string | null>(readFlash(location.state))

  function update(changes: Partial<AgendaParams>) {
    setSearch(toAgendaSearch({ ...params, ...changes }, todayKey), { replace: true })
  }

  const { from, to } = visibleRange(params)
  const appointments = useAppointments({
    from,
    to,
    doctorId: params.doctorId,
    specialty: params.specialty,
    roomId: params.roomId,
  })
  const all = appointments.data ?? []
  const visible = params.showReleased ? all : all.filter((a) => !isReleased(a.status))
  const hiddenCount = all.length - visible.length
  const dayKeys = visibleDayKeys(params)
  const truncated = all.length >= APPOINTMENTS_MAX_LIMIT

  function created(result: BookingResult) {
    setBooking(null)
    setMessage(
      result.count === 1
        ? 'Cita agendada correctamente.'
        : `Paquete agendado: ${result.count} sesiones.`,
    )
    update({ dateKey: limaDateKeyOf(result.firstStartsAt) })
  }

  // Clic en un hueco: solo si hay un doctor filtrado (sin él no sabemos de quién es el hueco).
  const canClickSlot = canManage && params.doctorId !== ''
  function freeSlot(dayKey: string, time: string) {
    setBooking({
      prefill: {
        doctorId: params.doctorId,
        dayKey,
        time,
        ...(params.specialty ? { specialty: params.specialty } : {}),
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Agenda</h1>
        {canManage && (
          <div className="flex gap-2">
            <button type="button" className={BUTTON_LINK} onClick={() => setBooking({})}>
              Nueva cita
            </button>
            <Link
              to="/agenda/hoy"
              className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              Lista de hoy
            </Link>
          </div>
        )}
      </div>

      <div aria-live="polite" className="empty:hidden">
        {message && <Alert tone="success">{message}</Alert>}
      </div>

      <AgendaToolbar
        params={params}
        todayKey={todayKey}
        onChange={update}
        onShift={(direction) => update({ dateKey: shiftDate(params, direction) })}
      />
      <AgendaFilters params={params} onChange={update} showDoctorFilter={!isDoctorOnly} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 first-letter:uppercase">
          {periodTitle(params)}
        </h2>
        <p className="text-sm text-slate-600">
          Horas de Lima.
          {isDoctorOnly && ' Solo se muestran sus citas.'}
          {params.specialty && ` Especialidad: ${SPECIALTY_LABELS[params.specialty]}.`}
          {hiddenCount > 0 && ` ${hiddenCount} cancelada(s) o ausente(s) ocultas.`}
        </p>
      </div>
      {canManage && params.mode === 'calendario' && (
        <p className="text-sm text-slate-600">
          {canClickSlot
            ? 'Haga clic en un hueco libre del calendario para agendar con ese doctor. Con teclado, use «Nueva cita».'
            : 'Para agendar desde un hueco del calendario, filtre primero por un doctor.'}
        </p>
      )}

      {appointments.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando agenda…
        </p>
      )}
      {appointments.isError && <AgendaError error={appointments.error} />}
      {truncated && (
        <Alert tone="warning">
          Se muestran las primeras {APPOINTMENTS_MAX_LIMIT} citas del periodo. Filtre por doctor o
          acorte el periodo para ver el resto.
        </Alert>
      )}
      {appointments.data &&
        (params.mode === 'calendario' ? (
          <CalendarGrid
            dayKeys={dayKeys}
            appointments={visible}
            todayKey={todayKey}
            now={now}
            onSelect={setSelected}
            {...(canClickSlot ? { onFreeSlot: freeSlot } : {})}
          />
        ) : (
          <AppointmentsListView
            appointments={visible}
            onSelect={setSelected}
            caption={`Citas · ${periodTitle(params)}`}
          />
        ))}

      <AppointmentDetailDialog
        appointment={selected}
        viewer={{ id: user.id, roles: user.roles }}
        onClose={() => setSelected(null)}
      />
      <NewAppointmentDialog
        open={booking !== null}
        {...(booking?.prefill ? { prefill: booking.prefill } : {})}
        onClose={() => setBooking(null)}
        onCreated={created}
      />
    </div>
  )
}
