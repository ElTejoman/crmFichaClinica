import { useState } from 'react'

import { useDoctors } from '@/entities/doctor'
import { formatDateTimeLima } from '@/shared/lib/dates'
import { ApiError } from '@/shared/lib/http'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { CareTeamRead } from '@/shared/types/aliases'
import { Alert, Badge, Button, Dialog, Field, Select, Spinner } from '@/shared/ui'

import { useAssignDoctor, useCareTeam, useEndAssignment } from '../api/usePatients'

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * Equipo tratante: los doctores con relación terapéutica. Esa relación es la que habilita al
 * doctor para ver al paciente (docs/04 §3); finalizarla le quita el acceso, por eso se confirma.
 */
export function CareTeamPanel({ patientId }: { patientId: string }) {
  const careTeam = useCareTeam(patientId)
  const doctors = useDoctors()
  const assign = useAssignDoctor(patientId)
  const endAssignment = useEndAssignment(patientId)
  const [selected, setSelected] = useState('')
  const [toEnd, setToEnd] = useState<CareTeamRead | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const entries = careTeam.data ?? []
  const activeIds = new Set(entries.filter((e) => e.is_active).map((e) => e.doctor_user_id))
  const options = (doctors.data ?? []).filter((d) => !activeIds.has(d.id))

  function submitAssign() {
    if (!selected) return
    setMessage(null)
    assign.mutate(selected, {
      onSuccess: () => {
        setSelected('')
        setMessage('Doctor asignado.')
      },
    })
  }

  function confirmEnd() {
    if (!toEnd) return
    const target = toEnd
    endAssignment.mutate(target.doctor_user_id, {
      onSuccess: () => setMessage(`Asignación de ${target.doctor_name} finalizada.`),
      onSettled: () => setToEnd(null),
    })
  }

  return (
    <section
      aria-labelledby="care-team-title"
      className="rounded-lg border border-slate-300 bg-white p-5"
    >
      <h2 id="care-team-title" className="text-base font-semibold text-slate-900">
        Equipo tratante
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        Los doctores asignados pueden ver a este paciente. Quien no esté asignado no lo verá en su
        lista.
      </p>

      {message && (
        <div className="mt-3">
          <Alert tone="success">{message}</Alert>
        </div>
      )}
      {(assign.isError || endAssignment.isError) && (
        <div className="mt-3">
          <Alert tone="error">
            {errorText(assign.error ?? endAssignment.error, 'No se pudo actualizar el equipo.')}
          </Alert>
        </div>
      )}

      {careTeam.isPending && (
        <p role="status" className="mt-3 flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando equipo…
        </p>
      )}
      {careTeam.isError && (
        <div className="mt-3">
          <Alert tone="error">{errorText(careTeam.error, 'No se pudo cargar el equipo.')}</Alert>
        </div>
      )}
      {careTeam.data &&
        (entries.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">Todavía no hay doctores asignados.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200" aria-label="Doctores asignados">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium text-slate-900">{entry.doctor_name}</span>{' '}
                  {entry.is_active ? (
                    <Badge tone="success" icon="●">
                      Activo
                    </Badge>
                  ) : (
                    <Badge tone="neutral" icon="○">
                      Finalizada
                    </Badge>
                  )}
                  <p className="text-xs text-slate-600">
                    Desde {formatDateTimeLima(entry.since)}
                    {entry.until ? ` hasta ${formatDateTimeLima(entry.until)}` : ''}
                  </p>
                </div>
                {entry.is_active && (
                  <Button
                    variant="secondary"
                    aria-label={`Finalizar asignación de ${entry.doctor_name}`}
                    onClick={() => setToEnd(entry)}
                  >
                    Finalizar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submitAssign()
        }}
      >
        <div className="w-full max-w-sm">
          <Field label="Asignar doctor">
            {(c) => (
              <Select {...c} value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Seleccione un doctor…</option>
                {options.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                    {d.specialties.length > 0
                      ? ` · ${d.specialties.map((s) => SPECIALTY_LABELS[s]).join(', ')}`
                      : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button type="submit" disabled={!selected} loading={assign.isPending}>
          Asignar
        </Button>
      </form>

      <Dialog
        open={toEnd !== null}
        onClose={() => setToEnd(null)}
        title="Finalizar asignación"
        description={`${toEnd?.doctor_name ?? ''} dejará de ver a este paciente.`}
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setToEnd(null)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirmEnd} loading={endAssignment.isPending}>
            Finalizar asignación
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
