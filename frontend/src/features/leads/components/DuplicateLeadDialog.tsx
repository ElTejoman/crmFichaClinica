import { Link } from 'react-router-dom'

import { LEAD_STATUS_LABELS } from '@/shared/lib/labels'
import type { LeadStatus } from '@/shared/types/aliases'
import { Button, Dialog } from '@/shared/ui'

import type { LeadDuplicateInfo } from '../duplicates'

const LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

interface DuplicateLeadDialogProps {
  info: LeadDuplicateInfo | null
  loading: boolean
  onCreateAnyway: () => void
  onCancel: () => void
}

/** Aviso del 409: ya existe un lead o paciente con ese teléfono/correo. Permite crear igualmente. */
export function DuplicateLeadDialog({
  info,
  loading,
  onCreateAnyway,
  onCancel,
}: DuplicateLeadDialogProps) {
  return (
    <Dialog
      open={info !== null}
      onClose={onCancel}
      title="Ya existe un registro con ese contacto"
      description="Revise si es la misma persona antes de crear un lead duplicado."
    >
      {info && (
        <div className="flex flex-col gap-4">
          {info.leads.length > 0 && (
            <section aria-label="Leads existentes">
              <h3 className="text-sm font-semibold text-slate-900">Leads</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {info.leads.map((lead) => (
                  <li key={lead.id}>
                    <Link to={`/leads/${lead.id}`} target="_blank" rel="noopener" className={LINK}>
                      {lead.fullName}
                    </Link>{' '}
                    ({LEAD_STATUS_LABELS[lead.status as LeadStatus] ?? lead.status})
                  </li>
                ))}
              </ul>
            </section>
          )}
          {info.patients.length > 0 && (
            <section aria-label="Pacientes existentes">
              <h3 className="text-sm font-semibold text-slate-900">Pacientes</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {info.patients.map((patient) => (
                  <li key={patient.id}>
                    <Link
                      to={`/pacientes/${patient.id}`}
                      target="_blank"
                      rel="noopener"
                      className={LINK}
                    >
                      {patient.fullName}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
            <Button onClick={onCreateAnyway} loading={loading}>
              Crear de todos modos
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
