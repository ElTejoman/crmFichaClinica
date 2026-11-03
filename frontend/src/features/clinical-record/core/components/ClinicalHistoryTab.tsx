import { ApiError } from '@/shared/lib/http'
import type { Specialty } from '@/shared/types/aliases'
import { Spinner } from '@/shared/ui'

import { useClinicalSummary } from '../api/useClinicalHistory'
import { AllergiesPanel } from './AllergiesPanel'
import { ClinicalAlertsBanner } from './ClinicalAlertsBanner'
import { ClinicalError } from './ClinicalError'
import { ConditionsPanel } from './ConditionsPanel'
import { EncounterTimeline } from './EncounterTimeline'
import { MedicationsPanel } from './MedicationsPanel'

interface ClinicalHistoryTabProps {
  patientId: string
  /** `clinical:write`: solo el doctor escribe antecedentes y crea encuentros. */
  canWrite: boolean
  specialties: readonly Specialty[]
  onGoToConsents?: () => void
}

/** Pestaña «Historia clínica»: alertas arriba, línea de tiempo y gestión de antecedentes. */
export function ClinicalHistoryTab({
  patientId,
  canWrite,
  specialties,
  onGoToConsents,
}: ClinicalHistoryTabProps) {
  const summary = useClinicalSummary(patientId)
  // Sin acceso (p. ej. sin relación terapéutica) no se monta nada más: cada lectura sería otro 403.
  const forbidden = summary.error instanceof ApiError && summary.error.status === 403

  return (
    <div className="flex flex-col gap-5">
      {summary.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando historia clínica…
        </p>
      )}
      {summary.isError && <ClinicalError error={summary.error} />}
      {summary.data && (
        <ClinicalAlertsBanner
          summary={summary.data}
          {...(onGoToConsents ? { onGoToConsents } : {})}
        />
      )}
      {!forbidden && !summary.isPending && (
        <>
          <EncounterTimeline patientId={patientId} canCreate={canWrite} specialties={specialties} />
          <div className="grid gap-5 xl:grid-cols-2">
            <AllergiesPanel patientId={patientId} canWrite={canWrite} />
            <MedicationsPanel patientId={patientId} canWrite={canWrite} />
          </div>
          <ConditionsPanel patientId={patientId} canWrite={canWrite} />
        </>
      )}
    </div>
  )
}
