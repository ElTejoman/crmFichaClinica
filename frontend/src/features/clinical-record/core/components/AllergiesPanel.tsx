import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import type { AllergyRead } from '@/shared/types/aliases'
import { Badge, Button, CheckboxField, Field, Input, Select, Spinner } from '@/shared/ui'

import { useAddAllergy, useAllergies, useUpdateAllergy } from '../api/useClinicalHistory'
import { ALL_ALLERGY_SEVERITIES, ALLERGY_SEVERITY_LABELS } from '../labels'
import {
  allergyFormSchema,
  EMPTY_ALLERGY_VALUES,
  toAllergyCreate,
  type AllergyFormValues,
} from '../schemas'
import { ClinicalError } from './ClinicalError'

function AllergyForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const add = useAddAllergy(patientId)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AllergyFormValues>({
    resolver: zodResolver(allergyFormSchema),
    defaultValues: EMPTY_ALLERGY_VALUES,
  })

  async function submit(values: AllergyFormValues) {
    try {
      await add.mutateAsync(toAllergyCreate(values))
      onDone()
    } catch {
      // El error se muestra desde `add.error`; el formulario queda abierto con lo escrito.
    }
  }

  return (
    <form
      noValidate
      aria-label="Agregar alergia"
      onSubmit={handleSubmit(submit)}
      className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4"
    >
      {add.isError && <ClinicalError error={add.error} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Sustancia" required error={errors.substance?.message}>
          {(c) => <Input {...c} autoComplete="off" {...register('substance')} />}
        </Field>
        <Field label="Gravedad" required>
          {(c) => (
            <Select {...c} {...register('severity')}>
              {ALL_ALLERGY_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {ALLERGY_SEVERITY_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Reacción" error={errors.reaction?.message}>
        {(c) => <Input {...c} autoComplete="off" {...register('reaction')} />}
      </Field>
      <CheckboxField label="Verificada por el doctor" {...register('verified')} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={add.isPending}>
          Guardar alergia
        </Button>
      </div>
    </form>
  )
}

function AllergyItem({
  allergy,
  canWrite,
  busy,
  onToggle,
}: {
  allergy: AllergyRead
  canWrite: boolean
  busy: boolean
  onToggle: (allergy: AllergyRead) => void
}) {
  const active = allergy.status === 'ACTIVE'
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong className={active ? 'text-slate-900' : 'text-slate-500 line-through'}>
          {allergy.substance}
        </strong>
        <Badge tone={active && allergy.severity === 'SEVERE' ? 'danger' : 'neutral'} icon="⚠">
          {ALLERGY_SEVERITY_LABELS[allergy.severity]}
        </Badge>
        {allergy.reaction && <span className="text-slate-700">{allergy.reaction}</span>}
        {!active && <Badge tone="neutral">Inactiva</Badge>}
      </div>
      {canWrite && (
        <Button
          variant="secondary"
          className="min-h-8 px-2.5 py-1 text-xs"
          disabled={busy}
          aria-label={`${active ? 'Marcar inactiva' : 'Reactivar'}: ${allergy.substance}`}
          onClick={() => onToggle(allergy)}
        >
          {active ? 'Marcar inactiva' : 'Reactivar'}
        </Button>
      )}
    </li>
  )
}

/** Alergias: alta y paso a inactiva (jamás se borran, para conservar el historial). */
export function AllergiesPanel({ patientId, canWrite }: { patientId: string; canWrite: boolean }) {
  const allergies = useAllergies(patientId)
  const update = useUpdateAllergy(patientId)
  const [adding, setAdding] = useState(false)

  function toggle(allergy: AllergyRead) {
    update.mutate({
      id: allergy.id,
      changes: { status: allergy.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
    })
  }

  return (
    <section
      aria-labelledby="allergies-title"
      className="rounded-xl border border-slate-300 bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="allergies-title" className="text-base font-semibold text-slate-900">
          Alergias
        </h3>
        {canWrite && !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Agregar alergia
          </Button>
        )}
      </div>
      {allergies.isPending && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <Spinner /> Cargando alergias…
        </p>
      )}
      {allergies.isError && <ClinicalError error={allergies.error} />}
      {update.isError && <ClinicalError error={update.error} />}
      {allergies.data &&
        (allergies.data.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No hay alergias registradas.</p>
        ) : (
          <ul className="mt-2" aria-label="Lista de alergias">
            {allergies.data.map((allergy) => (
              <AllergyItem
                key={allergy.id}
                allergy={allergy}
                canWrite={canWrite}
                busy={update.isPending}
                onToggle={toggle}
              />
            ))}
          </ul>
        ))}
      {adding && <AllergyForm patientId={patientId} onDone={() => setAdding(false)} />}
    </section>
  )
}
