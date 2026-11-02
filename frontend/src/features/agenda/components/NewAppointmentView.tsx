import { useNavigate, useSearchParams } from 'react-router-dom'

import { flashState } from '@/shared/lib/flash'
import { limaDateKeyOf } from '@/shared/lib/dates'

import { BookingWizard, type BookingResult } from './BookingWizard'

/** Página `/agenda/nueva`: acepta `?patient=<id>` para venir pre-seleccionado desde la ficha. */
export function NewAppointmentView() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const patientId = search.get('patient')

  function created(result: BookingResult) {
    const day = limaDateKeyOf(result.firstStartsAt)
    const message =
      result.count === 1
        ? 'Cita agendada correctamente.'
        : `Paquete agendado: ${result.count} sesiones.`
    void navigate(`/agenda?fecha=${day}`, { state: flashState(message) })
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-slate-900">Nueva cita</h1>
      <div className="max-w-4xl">
        <BookingWizard
          initialPatientId={patientId}
          onCreated={created}
          onCancel={() => void navigate('/agenda')}
        />
      </div>
    </div>
  )
}
