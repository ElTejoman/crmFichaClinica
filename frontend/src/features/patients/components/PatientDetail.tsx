import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import {
  patientToFormValues,
  PatientForm,
  toPatientUpdate,
  type PatientFormValues,
} from '@/entities/patient'
import { readFlash } from '@/shared/lib/flash'
import { ApiError } from '@/shared/lib/http'
import { Alert, Badge, Button, Dialog, Spinner } from '@/shared/ui'

import { usePatient, useUpdatePatient } from '../api/usePatients'
import { CareTeamPanel } from './CareTeamPanel'
import { PatientDataView } from './PatientDataView'

const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_UNPROCESSABLE = 422
const BACK_LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

function LoadError({ error }: { error: unknown }) {
  const status = error instanceof ApiError ? error.status : 0
  // El 403 es la regla de relación terapéutica funcionando: se explica con claridad, no como fallo.
  const text =
    status === HTTP_FORBIDDEN
      ? 'No tienes una relación terapéutica con este paciente.'
      : status === HTTP_NOT_FOUND || status === HTTP_UNPROCESSABLE
        ? 'No se encontró al paciente.'
        : error instanceof ApiError
          ? error.message
          : 'No se pudo cargar al paciente.'
  return (
    <div className="flex flex-col gap-3">
      <Alert tone={status === HTTP_FORBIDDEN ? 'warning' : 'error'}>{text}</Alert>
      <Link to="/pacientes" className={BACK_LINK}>
        Volver a pacientes
      </Link>
    </div>
  )
}

/** Ficha administrativa del paciente: datos, edición, archivado y equipo tratante. */
export function PatientDetail({ patientId, canManage }: { patientId: string; canManage: boolean }) {
  const patient = usePatient(patientId)
  const update = useUpdatePatient(patientId)
  const location = useLocation()
  const flash = readFlash(location.state)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  if (patient.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-slate-600">
        <Spinner /> Cargando paciente…
      </p>
    )
  }
  if (patient.isError) return <LoadError error={patient.error} />

  const data = patient.data

  async function save(values: PatientFormValues) {
    const changes = toPatientUpdate(patientToFormValues(data), values)
    if (Object.keys(changes).length === 0) {
      setEditing(false)
      setMessage('No hay cambios que guardar.')
      return
    }
    await update.mutateAsync(changes)
    setEditing(false)
    setMessage('Cambios guardados.')
  }

  function setActive(isActive: boolean) {
    setArchiveError(null)
    update.mutate(
      { is_active: isActive },
      {
        onSuccess: () => setMessage(isActive ? 'Paciente reactivado.' : 'Paciente archivado.'),
        onError: (error) =>
          setArchiveError(error instanceof ApiError ? error.message : 'No se pudo actualizar.'),
        onSettled: () => setConfirmArchive(false),
      },
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/pacientes" className={`${BACK_LINK} text-sm`}>
        ← Pacientes
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{data.full_name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            {data.hc_code && <Badge tone="brand">Historia clínica {data.hc_code}</Badge>}
            {data.is_active ? (
              <Badge tone="success" icon="●">
                Activo
              </Badge>
            ) : (
              <Badge tone="neutral" icon="○">
                Archivado
              </Badge>
            )}
            <span className="text-sm text-slate-700">
              {data.age} {data.age === 1 ? 'año' : 'años'}
            </span>
          </p>
        </div>
        {canManage && !editing && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setMessage(null)
                setEditing(true)
              }}
            >
              Editar
            </Button>
            {data.is_active ? (
              <Button variant="secondary" onClick={() => setConfirmArchive(true)}>
                Archivar
              </Button>
            ) : (
              <Button
                variant="secondary"
                loading={update.isPending}
                onClick={() => setActive(true)}
              >
                Reactivar
              </Button>
            )}
          </div>
        )}
      </header>

      <Alert tone="info">
        Aquí solo se muestran datos administrativos. La ficha clínica estará disponible en una fase
        posterior.
      </Alert>
      {flash && <Alert tone="success">{flash}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      {archiveError && <Alert tone="error">{archiveError}</Alert>}

      {editing ? (
        <PatientForm
          mode="edit"
          ariaLabel="Editar paciente"
          initialValues={patientToFormValues(data)}
          submitLabel="Guardar cambios"
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <PatientDataView patient={data} />
      )}

      {canManage && <CareTeamPanel patientId={patientId} />}

      <Dialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archivar paciente"
        description="El paciente dejará de aparecer en las búsquedas habituales. No se borra ninguna información y se puede reactivar."
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmArchive(false)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={update.isPending} onClick={() => setActive(false)}>
            Archivar
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
