import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/ui'

import { useCreateEncounter } from '../api/useEncounters'
import { encounterPath } from '../paths'
import { describeClinicalError, existingEncounterId } from '../serverErrors'

interface StartEncounterButtonProps {
  appointmentId: string
  patientId: string
  patientName: string
  /** «Iniciar atención» (en espera) o «Continuar ficha» (ya en atención). */
  label: string
}

/**
 * Abre la ficha clínica de una cita. Crear el encuentro desde una cita en espera también pasa
 * la cita a «en atención». Si la cita ya tenía encuentro (409 `encounter_exists`) se navega al
 * existente en vez de mostrar un error: es el caso normal al volver a abrir la ficha.
 */
export function StartEncounterButton({
  appointmentId,
  patientId,
  patientName,
  label,
}: StartEncounterButtonProps) {
  const navigate = useNavigate()
  const create = useCreateEncounter()
  const [message, setMessage] = useState<string | null>(null)

  function start() {
    setMessage(null)
    create.mutate(
      { appointment_id: appointmentId },
      {
        onSuccess: (encounter) => navigate(encounterPath(patientId, encounter.id)),
        onError: (error) => {
          const existing = existingEncounterId(error)
          if (existing) navigate(encounterPath(patientId, existing))
          else setMessage(describeClinicalError(error))
        },
      },
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button loading={create.isPending} aria-label={`${label}: ${patientName}`} onClick={start}>
        {label}
      </Button>
      <p role="alert" className="max-w-64 text-right text-xs text-red-800 empty:hidden">
        {message}
      </p>
    </div>
  )
}
