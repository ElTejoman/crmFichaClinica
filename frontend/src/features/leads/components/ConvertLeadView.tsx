import { Link, useNavigate } from 'react-router-dom'

import {
  formatHcCode,
  PatientForm,
  toPatientCreate,
  type PatientFormValues,
} from '@/entities/patient'
import { flashState } from '@/shared/lib/flash'
import { ApiError } from '@/shared/lib/http'
import { Alert, Spinner } from '@/shared/ui'

import { useConvertLead, useLead } from '../api/useLeads'
import { leadToPatientDefaults } from '../leadToPatient'

const LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/** Convierte un lead en paciente con el formulario de paciente pre-rellenado. */
export function ConvertLeadView({ leadId }: { leadId: string }) {
  const lead = useLead(leadId)
  const convert = useConvertLead(leadId)
  const navigate = useNavigate()

  if (lead.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-slate-600">
        <Spinner /> Cargando lead…
      </p>
    )
  }
  if (lead.isError) {
    return (
      <Alert tone="error">
        {lead.error instanceof ApiError ? lead.error.message : 'No se pudo cargar el lead.'}
      </Alert>
    )
  }
  const data = lead.data
  if (data.status === 'CONVERTED') {
    return (
      <Alert tone="info">
        Este lead ya fue convertido en paciente.{' '}
        {data.converted_patient_id && (
          <Link to={`/pacientes/${data.converted_patient_id}`} className={LINK}>
            Ver ficha del paciente
          </Link>
        )}
      </Alert>
    )
  }

  async function submit(values: PatientFormValues) {
    const result = await convert.mutateAsync(toPatientCreate(values))
    const hc = formatHcCode(result.hc_number)
    navigate(`/pacientes/${result.patient_id}`, {
      state: flashState(
        hc
          ? `Lead convertido en paciente. Historia clínica ${hc}.`
          : 'Lead convertido en paciente.',
      ),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to={`/leads/${leadId}`} className={`${LINK} text-sm`}>
        ← Volver al lead
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Convertir en paciente</h1>
      <Alert tone="info">
        Se pre-rellenaron los datos de <strong>{data.full_name}</strong>. Revise el nombre y
        complete documento, fecha de nacimiento, sexo y el consentimiento de datos. Al guardar se
        crea el paciente con su historia clínica y el lead pasa a «Convertido».
      </Alert>
      <PatientForm
        mode="create"
        ariaLabel="Convertir en paciente"
        initialValues={leadToPatientDefaults(data)}
        submitLabel="Crear paciente y convertir"
        onSubmit={submit}
        onCancel={() => navigate(`/leads/${leadId}`)}
      />
    </div>
  )
}
