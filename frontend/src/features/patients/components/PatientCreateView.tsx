import { useNavigate } from 'react-router-dom'

import {
  EMPTY_PATIENT_VALUES,
  formatHcCode,
  PatientForm,
  toPatientCreate,
  type PatientFormValues,
} from '@/entities/patient'
import { flashState } from '@/shared/lib/flash'

import { useCreatePatient } from '../api/usePatients'

/** Pantalla de alta de paciente. Al guardar aterriza en su ficha mostrando el código de HC. */
export function PatientCreateView() {
  const navigate = useNavigate()
  const createPatient = useCreatePatient()

  async function submit(values: PatientFormValues) {
    const patient = await createPatient.mutateAsync(toPatientCreate(values))
    const hc = patient.hc_code ?? formatHcCode(patient.hc_number)
    const message = hc ? `Paciente creado. Historia clínica ${hc}.` : 'Paciente creado.'
    navigate(`/pacientes/${patient.id}`, { state: flashState(message) })
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-slate-900">Nuevo paciente</h1>
      <p className="text-sm text-slate-700">
        Se registran solo datos administrativos. Los campos con * son obligatorios.
      </p>
      <PatientForm
        mode="create"
        ariaLabel="Nuevo paciente"
        initialValues={EMPTY_PATIENT_VALUES}
        submitLabel="Crear paciente"
        onSubmit={submit}
        onCancel={() => navigate('/pacientes')}
      />
    </div>
  )
}
