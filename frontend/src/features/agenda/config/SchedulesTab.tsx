import { useState } from 'react'

import { useDoctors } from '@/entities/doctor'
import { WEEKDAY_LABELS } from '@/shared/lib/labels'
import type { WorkingBlockRead } from '@/shared/types/aliases'
import { Alert, Badge, Button, Dialog, Field, Select, Spinner } from '@/shared/ui'

import { useCreateSchedule, useSchedules, useUpdateSchedule } from '../api/useScheduleConfig'
import { AgendaError } from '../components/AgendaError'
import {
  EMPTY_SCHEDULE_VALUES,
  scheduleToFormValues,
  toWorkingBlockCreate,
  toWorkingBlockUpdate,
  trimSeconds,
} from '../schemas'
import { ScheduleForm } from './ScheduleForm'

type Editing = { kind: 'new' } | { kind: 'edit'; block: WorkingBlockRead }

function describeValidity(block: WorkingBlockRead): string | null {
  if (block.valid_from && block.valid_to)
    return `Vigente del ${block.valid_from} al ${block.valid_to}`
  if (block.valid_from) return `Vigente desde el ${block.valid_from}`
  if (block.valid_to) return `Vigente hasta el ${block.valid_to}`
  return null
}

/** Horarios semanales por doctor. No hay borrado: un bloque se desactiva (queda el historial). */
export function SchedulesTab() {
  const doctors = useDoctors()
  const [doctorId, setDoctorId] = useState('')
  const schedules = useSchedules(doctorId)
  const create = useCreateSchedule()
  const update = useUpdateSchedule()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const blocks = schedules.data ?? []

  async function save(values: Parameters<typeof toWorkingBlockCreate>[1]) {
    if (!editing) return
    if (editing.kind === 'new') {
      await create.mutateAsync(toWorkingBlockCreate(doctorId, values))
      setMessage('Bloque de horario creado.')
    } else {
      await update.mutateAsync({ id: editing.block.id, changes: toWorkingBlockUpdate(values) })
      setMessage('Bloque de horario actualizado.')
    }
    setEditing(null)
  }

  function toggleActive(block: WorkingBlockRead) {
    setMessage(null)
    update.mutate(
      { id: block.id, changes: { is_active: !block.is_active } },
      {
        onSuccess: () => setMessage(block.is_active ? 'Bloque desactivado.' : 'Bloque reactivado.'),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Field label="Doctor" required>
            {(c) => (
              <Select
                value={doctorId}
                onChange={(e) => {
                  setDoctorId(e.target.value)
                  setMessage(null)
                }}
                {...c}
              >
                <option value="">Elija un doctor</option>
                {(doctors.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button disabled={doctorId === ''} onClick={() => setEditing({ kind: 'new' })}>
          Agregar bloque
        </Button>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {message && <Alert tone="success">{message}</Alert>}
      </div>
      {update.isError && !editing && <AgendaError error={update.error} />}

      {doctorId === '' && (
        <p className="text-sm text-slate-600">
          Elija un doctor para ver y editar su horario semanal.
        </p>
      )}
      {schedules.isPending && doctorId !== '' && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando horario…
        </p>
      )}
      {schedules.isError && <AgendaError error={schedules.error} />}
      {schedules.data && (
        <ul aria-label="Horario semanal" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {WEEKDAY_LABELS.map((label, weekday) => {
            const dayBlocks = blocks
              .filter((b) => b.weekday === weekday)
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
            return (
              <li key={label} className="rounded-lg border border-slate-300 bg-white p-3">
                <h3 className="font-semibold text-slate-900">{label}</h3>
                {dayBlocks.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">Sin atención</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {dayBlocks.map((block) => (
                      <li
                        key={block.id}
                        className={`rounded-md border p-2 text-sm ${block.is_active ? 'border-brand-500/50 bg-brand-50' : 'border-slate-300 bg-slate-50 text-slate-600'}`}
                      >
                        <p className="font-medium">
                          {trimSeconds(block.start_time)}–{trimSeconds(block.end_time)}{' '}
                          <span className="font-normal">· cada {block.slot_minutes} min</span>
                        </p>
                        {describeValidity(block) && (
                          <p className="text-xs">{describeValidity(block)}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {!block.is_active && (
                            <Badge tone="neutral" icon="○">
                              Inactivo
                            </Badge>
                          )}
                          <Button
                            variant="secondary"
                            className="min-h-8 px-2.5 py-1 text-xs"
                            aria-label={`Editar bloque ${label} ${trimSeconds(block.start_time)}`}
                            onClick={() => {
                              setMessage(null)
                              update.reset()
                              setEditing({ kind: 'edit', block })
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="secondary"
                            className="min-h-8 px-2.5 py-1 text-xs"
                            disabled={update.isPending}
                            aria-label={`${block.is_active ? 'Desactivar' : 'Reactivar'} bloque ${label} ${trimSeconds(block.start_time)}`}
                            onClick={() => toggleActive(block)}
                          >
                            {block.is_active ? 'Desactivar' : 'Reactivar'}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.kind === 'edit' ? 'Editar bloque de horario' : 'Nuevo bloque de horario'}
      >
        {editing && (
          <ScheduleForm
            initialValues={
              editing.kind === 'edit' ? scheduleToFormValues(editing.block) : EMPTY_SCHEDULE_VALUES
            }
            submitLabel={editing.kind === 'edit' ? 'Guardar cambios' : 'Crear bloque'}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  )
}
