import { can } from '@/entities/user'
import { MyAgendaView } from '@/features/agenda'
import { useAuth } from '@/features/auth'
import { StartEncounterButton } from '@/features/clinical-record'

export function MyAgendaPage() {
  const { user } = useAuth()
  if (!user) return null
  const canWriteClinical = can(user.roles, 'clinical:write')
  return (
    <MyAgendaView
      user={user}
      renderClinicalAction={(appointment) => {
        // Solo con la paciente en espera o ya en atención se puede abrir (o retomar) la ficha clínica.
        const startable =
          appointment.status === 'CHECKED_IN' || appointment.status === 'IN_PROGRESS'
        if (!canWriteClinical || !startable) return null
        return (
          <StartEncounterButton
            appointmentId={appointment.id}
            patientId={appointment.patient_id}
            patientName={appointment.patient_name}
            label={appointment.status === 'CHECKED_IN' ? 'Iniciar atención' : 'Continuar ficha'}
          />
        )
      }}
    />
  )
}
