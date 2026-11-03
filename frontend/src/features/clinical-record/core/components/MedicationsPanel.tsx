import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { formatCalendarDate } from '@/shared/lib/dates'
import type { MedicationRead } from '@/shared/types/aliases'
import { Badge, Button, Field, Input, Spinner } from '@/shared/ui'

import { useAddMedication, useMedications, useUpdateMedication } from '../api/useClinicalHistory'
import {
  EMPTY_MEDICATION_VALUES,
  medicationFormSchema,
  toMedicationCreate,
  type MedicationFormValues,
} from '../schemas'
import { ClinicalError } from './ClinicalError'

function MedicationForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const add = useAddMedication(patientId)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MedicationFormValues>({
    resolver: zodResolver(medicationFormSchema),
    defaultValues: EMPTY_MEDICATION_VALUES,
  })

  async function submit(values: MedicationFormValues) {
    try {
      await add.mutateAsync(toMedicationCreate(values))
      onDone()
    } catch {
      // El error se muestra desde `add.error`; el formulario queda abierto con lo escrito.
    }
  }

  return (
    <form
      noValidate
      aria-label="Agregar medicación"
      onSubmit={handleSubmit(submit)}
      className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4"
    >
      {add.isError && <ClinicalError error={add.error} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Medicamento" required error={errors.name?.message}>
          {(c) => <Input {...c} autoComplete="off" {...register('name')} />}
        </Field>
        <Field label="Dosis" error={errors.dose?.message}>
          {(c) => <Input {...c} autoComplete="off" {...register('dose')} />}
        </Field>
        <Field label="Vía" error={errors.route?.message}>
          {(c) => <Input {...c} autoComplete="off" {...register('route')} />}
        </Field>
        <Field label="Frecuencia" error={errors.frequency?.message}>
          {(c) => <Input {...c} autoComplete="off" {...register('frequency')} />}
        </Field>
        <Field label="Desde" error={errors.since?.message}>
          {(c) => <Input type="date" {...c} {...register('since')} />}
        </Field>
        <Field label="Hasta" error={errors.until?.message}>
          {(c) => <Input type="date" {...c} {...register('until')} />}
        </Field>
      </div>
      <Field label="Prescriptor" error={errors.prescriber?.message}>
        {(c) => <Input {...c} autoComplete="off" {...register('prescriber')} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={add.isPending}>
          Guardar medicación
        </Button>
      </div>
    </form>
  )
}

function describeMedication(m: MedicationRead): string {
  const parts = [m.dose, m.route, m.frequency].filter((p): p is string => Boolean(p))
  if (m.since) parts.push(`desde ${formatCalendarDate(m.since)}`)
  if (m.until) parts.push(`hasta ${formatCalendarDate(m.until)}`)
  return parts.join(' · ')
}

/** Medicación: alta y paso a inactiva (se conserva el historial de lo que tomó). */
export function MedicationsPanel({
  patientId,
  canWrite,
}: {
  patientId: string
  canWrite: boolean
}) {
  const medications = useMedications(patientId)
  const update = useUpdateMedication(patientId)
  const [adding, setAdding] = useState(false)

  return (
    <section
      aria-labelledby="medications-title"
      className="rounded-xl border border-slate-300 bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="medications-title" className="text-base font-semibold text-slate-900">
          Medicación
        </h3>
        {canWrite && !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Agregar medicación
          </Button>
        )}
      </div>
      {medications.isPending && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <Spinner /> Cargando medicación…
        </p>
      )}
      {medications.isError && <ClinicalError error={medications.error} />}
      {update.isError && <ClinicalError error={update.error} />}
      {medications.data &&
        (medications.data.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No hay medicación registrada.</p>
        ) : (
          <ul className="mt-2" aria-label="Lista de medicación">
            {medications.data.map((m) => {
              const active = m.status === 'ACTIVE'
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-2 first:border-t-0"
                >
                  <div className="text-sm">
                    <strong className={active ? 'text-slate-900' : 'text-slate-500 line-through'}>
                      {m.name}
                    </strong>{' '}
                    <span className="text-slate-700">{describeMedication(m)}</span>{' '}
                    {!active && <Badge tone="neutral">Inactiva</Badge>}
                  </div>
                  {canWrite && (
                    <Button
                      variant="secondary"
                      className="min-h-8 px-2.5 py-1 text-xs"
                      disabled={update.isPending}
                      aria-label={`${active ? 'Marcar inactiva' : 'Reactivar'}: ${m.name}`}
                      onClick={() =>
                        update.mutate({
                          id: m.id,
                          changes: { status: active ? 'INACTIVE' : 'ACTIVE' },
                        })
                      }
                    >
                      {active ? 'Marcar inactiva' : 'Reactivar'}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        ))}
      {adding && <MedicationForm patientId={patientId} onDone={() => setAdding(false)} />}
    </section>
  )
}
