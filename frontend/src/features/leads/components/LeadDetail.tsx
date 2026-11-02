import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useNow } from '@/shared/hooks/useNow'
import { formatShortDateTimeLima } from '@/shared/lib/dates'
import { ApiError } from '@/shared/lib/http'
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { LeadRead, LeadStatus } from '@/shared/types/aliases'
import { Alert, Badge, Button, Spinner } from '@/shared/ui'

import { useLead, useUpdateLead } from '../api/useLeads'
import { useAssignees, type CurrentUser } from '../hooks/useAssignees'
import { allowedTargets, isOpenStatus, requiresLostReason } from '../kanbanRules'
import { leadToFormValues, toLeadUpdate, type LeadFormValues } from '../schemas'
import { ActivityForm } from './ActivityForm'
import { ActivityList } from './ActivityList'
import { LeadForm } from './LeadForm'
import { LostReasonDialog } from './LostReasonDialog'
import { MoveMenu } from './MoveMenu'
import { NextActionBadge } from './NextActionBadge'

const LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-600 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children || '—'}</dd>
    </div>
  )
}

const HTTP_NOT_FOUND = 404
const HTTP_UNPROCESSABLE = 422

/** Un identificador mal escrito en la URL llega como 422 (UUID inválido): para la persona es "no existe". */
function loadErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === HTTP_NOT_FOUND || error.status === HTTP_UNPROCESSABLE) {
      return 'No se encontró el lead.'
    }
    return error.message
  }
  return 'No se pudo cargar el lead.'
}

function statusTone(status: LeadStatus) {
  if (status === 'CONVERTED') return 'success'
  if (status === 'LOST') return 'danger'
  return 'brand'
}

interface LeadDetailProps {
  leadId: string
  currentUser: CurrentUser
  canManage: boolean
  /** Convertir crea un paciente: exige gestionar leads Y pacientes. */
  canConvert: boolean
}

/** Detalle del lead: datos editables, cambio de estado, conversión, actividades e historial. */
export function LeadDetail({ leadId, currentUser, canManage, canConvert }: LeadDetailProps) {
  const lead = useLead(leadId)
  const now = useNow()
  const update = useUpdateLead(leadId)
  const { options, nameOf } = useAssignees(currentUser)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [askLostReason, setAskLostReason] = useState(false)

  if (lead.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-slate-600">
        <Spinner /> Cargando lead…
      </p>
    )
  }
  if (lead.isError) {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="error">{loadErrorText(lead.error)}</Alert>
        <Link to="/leads" className={LINK}>
          Volver al CRM
        </Link>
      </div>
    )
  }

  const data: LeadRead = lead.data
  const isConverted = data.status === 'CONVERTED'

  async function save(values: LeadFormValues) {
    const changes = toLeadUpdate(leadToFormValues(data), values)
    if (Object.keys(changes).length === 0) {
      setEditing(false)
      setMessage('No hay cambios que guardar.')
      return
    }
    await update.mutateAsync(changes)
    setEditing(false)
    setMessage('Cambios guardados.')
  }

  function changeStatus(to: LeadStatus, lostReason?: string) {
    setStatusError(null)
    setMessage(null)
    update.mutate(
      { status: to, ...(lostReason ? { lost_reason: lostReason } : {}) },
      {
        onSuccess: () => setMessage(`Estado cambiado a «${LEAD_STATUS_LABELS[to]}».`),
        onError: (e) =>
          setStatusError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.'),
        onSettled: () => setAskLostReason(false),
      },
    )
  }

  function requestStatus(to: LeadStatus) {
    if (requiresLostReason(to)) setAskLostReason(true)
    else changeStatus(to)
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/leads" className={`${LINK} text-sm`}>
        ← CRM
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{data.full_name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(data.status)}>{LEAD_STATUS_LABELS[data.status]}</Badge>
            <span className="text-sm text-slate-700">{LEAD_SOURCE_LABELS[data.source]}</span>
            <NextActionBadge nextActionAt={data.next_action_at} now={now} />
          </p>
        </div>
        {canManage && !isConverted && (
          <div className="flex flex-wrap items-start gap-2">
            {!editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  setMessage(null)
                  setEditing(true)
                }}
              >
                Editar
              </Button>
            )}
            <div className="w-40">
              <MoveMenu
                leadName={data.full_name}
                label="Cambiar estado…"
                compact={false}
                targets={allowedTargets(data.status)}
                disabled={update.isPending}
                onSelect={requestStatus}
              />
            </div>
            {canConvert && isOpenStatus(data.status) && (
              <Link
                to={`/leads/${data.id}/convertir`}
                className="inline-flex min-h-10 items-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                Convertir en paciente
              </Link>
            )}
          </div>
        )}
      </header>

      {message && <Alert tone="success">{message}</Alert>}
      {statusError && <Alert tone="error">{statusError}</Alert>}
      {isConverted && data.converted_patient_id && (
        <Alert tone="success">
          Este lead ya es paciente.{' '}
          <Link to={`/pacientes/${data.converted_patient_id}`} className={LINK}>
            Ver ficha del paciente
          </Link>
        </Alert>
      )}
      {data.status === 'LOST' && (
        <Alert tone="warning" title="Lead perdido">
          Motivo: {data.lost_reason ?? 'sin motivo registrado'}. Puede reabrirlo desde «Cambiar
          estado…».
        </Alert>
      )}

      {editing ? (
        <LeadForm
          ariaLabel="Editar lead"
          initialValues={leadToFormValues(data)}
          assignees={options}
          submitLabel="Guardar cambios"
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <section
          aria-labelledby="lead-data-title"
          className="rounded-lg border border-slate-300 bg-white p-5"
        >
          <h2 id="lead-data-title" className="mb-3 text-base font-semibold text-slate-900">
            Datos
          </h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Teléfono">{data.phone}</Item>
            <Item label="Correo">{data.email}</Item>
            <Item label="Responsable">{data.assigned_to_name ?? nameOf(data.assigned_to)}</Item>
            <Item label="Especialidades de interés">
              {data.interest_specialties.length > 0 && (
                <ul className="flex flex-wrap gap-1">
                  {data.interest_specialties.map((s) => (
                    <li key={s}>
                      <Badge tone="brand">{SPECIALTY_LABELS[s]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Item>
            <Item label="Marketing">
              {data.consent_marketing ? 'Autoriza comunicaciones' : 'No autoriza comunicaciones'}
            </Item>
            <Item label="Creado">{formatShortDateTimeLima(data.created_at)}</Item>
            <Item label="Notas">{data.notes}</Item>
          </dl>
        </section>
      )}

      {canManage && !isConverted && <ActivityForm leadId={leadId} />}
      <ActivityList activities={data.activities} />

      <LostReasonDialog
        leadName={askLostReason ? data.full_name : null}
        loading={update.isPending}
        onCancel={() => setAskLostReason(false)}
        onConfirm={(reason) => changeStatus('LOST', reason)}
      />
    </div>
  )
}
