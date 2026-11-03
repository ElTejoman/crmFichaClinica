import { useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import {
  patientToFormValues,
  PatientForm,
  toPatientUpdate,
  type PatientFormValues,
} from '@/entities/patient'
import { PatientAppointments } from '@/entities/appointment'
import { readFlash } from '@/shared/lib/flash'
import { ApiError } from '@/shared/lib/http'
import type { PatientRead } from '@/shared/types/aliases'
import { Alert, Badge, Button, Dialog, Spinner, Tabs } from '@/shared/ui'

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

/**
 * Pestaña adicional que otra parte de la app inyecta en la ficha (p. ej. la historia clínica).
 * La ficha administrativa no importa features clínicas: la página las compone y las pasa aquí.
 */
export interface PatientExtraTab {
  id: string
  label: string
  render: (patient: PatientRead, goToTab: (id: string) => void) => ReactNode
}

const ADMIN_TAB_ID = 'datos'
const TAB_PARAM = 'tab'

/** Ficha administrativa del paciente: datos, edición, archivado y equipo tratante. */
export function PatientDetail({
  patientId,
  canManage,
  canViewAppointments = false,
  canSchedule = false,
  extraTabs = [],
}: {
  patientId: string
  canManage: boolean
  /** AGENDA_READ: muestra «Próximas citas». */
  canViewAppointments?: boolean
  /** AGENDA_MANAGE: muestra «Agendar cita». */
  canSchedule?: boolean
  /** Pestañas que se suman a «Datos» (la pestaña activa viaja en `?tab=`; no contiene datos personales). */
  extraTabs?: readonly PatientExtraTab[]
}) {
  const patient = usePatient(patientId)
  const update = useUpdatePatient(patientId)
  const location = useLocation()
  const flash = readFlash(location.state)
  const [searchParams, setSearchParams] = useSearchParams()
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

  const requestedTab = searchParams.get(TAB_PARAM)
  const activeExtra = extraTabs.find((tab) => tab.id === requestedTab)
  const activeTab = activeExtra ? activeExtra.id : ADMIN_TAB_ID

  function goToTab(id: string) {
    setSearchParams(id === ADMIN_TAB_ID ? {} : { [TAB_PARAM]: id }, { replace: true })
  }

  const adminContent = (
    <div className="flex flex-col gap-5">
      <Alert tone="info">
        Aquí solo se muestran datos administrativos. El contenido clínico lo ve únicamente el
        personal autorizado, en la pestaña de historia clínica.
      </Alert>
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

      {canViewAppointments && <PatientAppointments patientId={patientId} />}
      {canManage && <CareTeamPanel patientId={patientId} />}
    </div>
  )

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
        {(canManage || canSchedule) && !editing && (
          <div className="flex flex-wrap gap-2">
            {canSchedule && (
              <Link
                to={`/agenda/nueva?patient=${patientId}`}
                className="inline-flex min-h-10 items-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                Agendar cita
              </Link>
            )}
            {canManage && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMessage(null)
                    setEditing(true)
                    goToTab(ADMIN_TAB_ID)
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
              </>
            )}
          </div>
        )}
      </header>

      {flash && <Alert tone="success">{flash}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      {archiveError && <Alert tone="error">{archiveError}</Alert>}

      {extraTabs.length === 0 ? (
        adminContent
      ) : (
        <Tabs
          label="Secciones de la ficha del paciente"
          tabs={[
            { id: ADMIN_TAB_ID, label: 'Datos' },
            ...extraTabs.map((tab) => ({ id: tab.id, label: tab.label })),
          ]}
          value={activeTab}
          onChange={goToTab}
        >
          {activeExtra ? activeExtra.render(data, goToTab) : adminContent}
        </Tabs>
      )}

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
