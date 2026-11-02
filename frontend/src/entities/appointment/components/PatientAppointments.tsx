import { ApiError } from '@/shared/lib/http'
import { Alert, Spinner } from '@/shared/ui'

import { usePatientAppointments } from '../api/useAppointments'
import { isOpen } from '../status'
import { AppointmentList } from './AppointmentList'

/** "Próximas citas" de un paciente: solo abiertas, de hoy en adelante, en hora de Lima. */
export function PatientAppointments({ patientId }: { patientId: string }) {
  const appointments = usePatientAppointments(patientId)
  const upcoming = (appointments.data ?? []).filter((a) => isOpen(a.status))

  return (
    <section
      aria-labelledby="patient-appointments-title"
      className="rounded-xl border border-slate-300 bg-white p-5"
    >
      <h2 id="patient-appointments-title" className="text-lg font-semibold text-slate-900">
        Próximas citas
      </h2>
      {appointments.isPending && (
        <p role="status" className="mt-3 flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando citas…
        </p>
      )}
      {appointments.isError && (
        <div className="mt-3">
          <Alert tone="error">
            {appointments.error instanceof ApiError
              ? appointments.error.message
              : 'No se pudieron cargar las citas.'}
          </Alert>
        </div>
      )}
      {appointments.data &&
        (upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">El paciente no tiene citas próximas.</p>
        ) : (
          <div className="mt-2">
            <AppointmentList appointments={upcoming} ariaLabel="Próximas citas del paciente" />
          </div>
        ))}
    </section>
  )
}
