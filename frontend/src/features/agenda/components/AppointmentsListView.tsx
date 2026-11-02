import { AppointmentStatusBadge } from '@/entities/appointment'
import { formatDayLong, formatTimeRangeLima, limaDateKeyOf } from '@/shared/lib/dates'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { AppointmentRead } from '@/shared/types/aliases'
import { Table, Td, Th } from '@/shared/ui'

/**
 * Alternativa en tabla del calendario: mismo contenido, navegable con teclado y lectores de
 * pantalla (un calendario posicionado en 2D es difícil de recorrer sin ratón).
 */
export function AppointmentsListView({
  appointments,
  onSelect,
  caption,
}: {
  appointments: readonly AppointmentRead[]
  onSelect: (appointment: AppointmentRead) => void
  caption: string
}) {
  if (appointments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
        No hay citas en este periodo con los filtros elegidos.
      </p>
    )
  }
  return (
    <Table caption={caption}>
      <thead>
        <tr>
          <Th>Día</Th>
          <Th>Hora</Th>
          <Th>Paciente</Th>
          <Th>Doctor</Th>
          <Th>Especialidad</Th>
          <Th>Sala</Th>
          <Th>Estado</Th>
        </tr>
      </thead>
      <tbody>
        {appointments.map((appointment) => (
          <tr key={appointment.id}>
            <Td className="whitespace-nowrap">
              {formatDayLong(limaDateKeyOf(appointment.starts_at)).replace(/ de \d{4}$/, '')}
            </Td>
            <Td className="whitespace-nowrap">
              {formatTimeRangeLima(appointment.starts_at, appointment.ends_at)}
            </Td>
            <Td>
              <button
                type="button"
                onClick={() => onSelect(appointment)}
                className="font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                {appointment.patient_name}
                <span className="sr-only">, ver detalle de la cita</span>
              </button>
            </Td>
            <Td>{appointment.doctor_name}</Td>
            <Td>{SPECIALTY_LABELS[appointment.specialty]}</Td>
            <Td>{appointment.room_name ?? '—'}</Td>
            <Td>
              <AppointmentStatusBadge status={appointment.status} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
