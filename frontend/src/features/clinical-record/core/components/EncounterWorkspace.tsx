import { Link } from 'react-router-dom'

import { usePatientById } from '@/entities/patient'
import { can } from '@/entities/user'
import { formatShortDateTimeLima } from '@/shared/lib/dates'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { Role } from '@/shared/types/aliases'
import { Alert, Badge, Spinner } from '@/shared/ui'

import { useClinicalSummary } from '../api/useClinicalHistory'
import { useEncounter } from '../api/useEncounters'
import { patientTabPath } from '../paths'
import { ClinicalAlertsBanner } from './ClinicalAlertsBanner'
import { ClinicalError } from './ClinicalError'
import { EncounterDraftEditor } from './EncounterDraftEditor'
import { EncounterStatusBadge } from './EncounterStatusBadge'
import { SignedEncounterView } from './SignedEncounterView'

const BACK_LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'
/** Nombre genérico: la clínica real se configura en una fase posterior. */
const CLINIC_PRINT_NAME = 'Clínica · Historia clínica'

interface EncounterWorkspaceProps {
  patientId: string
  encounterId: string
  viewer: { id: string; roles: readonly Role[] }
}

/**
 * Pantalla de un encuentro. Borrador del propio doctor => editor con autoguardado. Todo lo demás
 * (firmado, enmendado, borrador de solo lectura) => vista de solo lectura sin campos editables.
 */
export function EncounterWorkspace({ patientId, encounterId, viewer }: EncounterWorkspaceProps) {
  const encounter = useEncounter(encounterId)
  const patient = usePatientById(patientId)
  const summary = useClinicalSummary(patientId)
  const back = patientTabPath(patientId, 'historia')

  if (encounter.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-slate-600">
        <Spinner /> Cargando encuentro…
      </p>
    )
  }
  if (encounter.isError) {
    return (
      <div className="flex flex-col gap-3">
        <ClinicalError error={encounter.error} />
        <Link to={back} className={BACK_LINK}>
          Volver a la historia clínica
        </Link>
      </div>
    )
  }

  const data = encounter.data
  // La URL lleva dos ids: si no corresponden entre sí no se muestra nada (evita confundir pacientes).
  if (data.patient_id !== patientId) {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="error">Este encuentro no pertenece al paciente indicado.</Alert>
        <Link to={back} className={BACK_LINK}>
          Volver a la historia clínica
        </Link>
      </div>
    )
  }

  const isAuthor = data.doctor_user_id === viewer.id
  const canWrite = can(viewer.roles, 'clinical:write')
  const editable = data.status === 'DRAFT' && isAuthor && canWrite
  const patientName = patient.data?.full_name ?? 'Paciente'

  return (
    <div className="flex flex-col gap-5">
      <Link to={back} className={`${BACK_LINK} text-sm`} data-no-print>
        ← Historia clínica
      </Link>

      {/* Solo aparece al imprimir: sin menús, con el encabezado del documento. */}
      <div className="print-only border-b border-slate-400 pb-3">
        <p className="text-lg font-semibold">{CLINIC_PRINT_NAME}</p>
        <p>
          Paciente: {patientName}
          {patient.data?.hc_code && ` · ${patient.data.hc_code}`}
        </p>
        <p>
          Atención del {formatShortDateTimeLima(data.occurred_at)} (hora de Lima) ·{' '}
          {SPECIALTY_LABELS[data.specialty]}
        </p>
        {data.signer_name && <p>Firmante: {data.signer_name}</p>}
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Encuentro de {SPECIALTY_LABELS[data.specialty]}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <Link to={`/pacientes/${patientId}`} className={BACK_LINK}>
              {patientName}
            </Link>
            {patient.data?.hc_code && (
              <Badge tone="brand">Historia clínica {patient.data.hc_code}</Badge>
            )}
            {patient.data && (
              <span>
                {patient.data.age} {patient.data.age === 1 ? 'año' : 'años'}
              </span>
            )}
            <EncounterStatusBadge status={data.status} />
          </p>
        </div>
      </header>

      <div data-no-print>
        {summary.data && <ClinicalAlertsBanner summary={summary.data} compact />}
        {summary.isError && <ClinicalError error={summary.error} />}
      </div>

      {editable ? (
        <EncounterDraftEditor key={data.id} encounter={data} summary={summary.data ?? null} />
      ) : (
        <SignedEncounterView encounter={data} canAmend={isAuthor && canWrite} />
      )}
    </div>
  )
}
