import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { Specialty } from '@/shared/types/aliases'
import { Alert, Button, Dialog, Field, Select } from '@/shared/ui'

import { useCreateEncounter } from '../api/useEncounters'
import { encounterPath } from '../paths'
import { ClinicalError } from './ClinicalError'

interface NewEncounterDialogProps {
  open: boolean
  onClose: () => void
  patientId: string
  /** Especialidades que ofrece el doctor: el servidor rechaza cualquier otra. */
  specialties: readonly Specialty[]
}

/** «Nuevo encuentro» sin cita: el doctor elige entre SUS especialidades y se abre el borrador. */
export function NewEncounterDialog({
  open,
  onClose,
  patientId,
  specialties,
}: NewEncounterDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nuevo encuentro"
      description="Se creará un borrador. Podrá completarlo y firmarlo cuando termine la atención."
    >
      {open && (
        <NewEncounterForm patientId={patientId} specialties={specialties} onClose={onClose} />
      )}
    </Dialog>
  )
}

function NewEncounterForm({
  patientId,
  specialties,
  onClose,
}: Pick<NewEncounterDialogProps, 'patientId' | 'specialties' | 'onClose'>) {
  const navigate = useNavigate()
  const create = useCreateEncounter()
  const [specialty, setSpecialty] = useState<Specialty | undefined>(specialties[0])

  if (specialties.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="warning">
          Su perfil no tiene especialidades asignadas, así que no puede iniciar encuentros. Pida al
          administrador que las configure.
        </Alert>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    )
  }

  function submit() {
    if (!specialty) return
    create.mutate(
      { patient_id: patientId, specialty },
      {
        onSuccess: (encounter) => {
          onClose()
          navigate(encounterPath(patientId, encounter.id))
        },
      },
    )
  }

  return (
    <form
      noValidate
      aria-label="Nuevo encuentro"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-4"
    >
      {create.isError && <ClinicalError error={create.error} />}
      <Field label="Especialidad" required>
        {(c) => (
          <Select
            {...c}
            value={specialty ?? ''}
            onChange={(event) => {
              const chosen = specialties.find((s) => s === event.target.value)
              if (chosen) setSpecialty(chosen)
            }}
          >
            {specialties.map((s) => (
              <option key={s} value={s}>
                {SPECIALTY_LABELS[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending}>
          Crear borrador
        </Button>
      </div>
    </form>
  )
}
