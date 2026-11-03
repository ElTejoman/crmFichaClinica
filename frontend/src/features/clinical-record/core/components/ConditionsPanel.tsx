import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { Badge, Button, Field, Input, Select, Spinner } from '@/shared/ui'

import { useAddCondition, useConditions, useUpdateCondition } from '../api/useClinicalHistory'
import { ALL_CONDITION_KINDS, CONDITION_KIND_LABELS } from '../labels'
import {
  conditionFormSchema,
  EMPTY_CONDITION_VALUES,
  toConditionCreate,
  type ConditionFormValues,
} from '../schemas'
import { ClinicalError } from './ClinicalError'

function ConditionForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const add = useAddCondition(patientId)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConditionFormValues>({
    resolver: zodResolver(conditionFormSchema),
    defaultValues: EMPTY_CONDITION_VALUES,
  })

  async function submit(values: ConditionFormValues) {
    try {
      await add.mutateAsync(toConditionCreate(values))
      onDone()
    } catch {
      // El error se muestra desde `add.error`; el formulario queda abierto con lo escrito.
    }
  }

  return (
    <form
      noValidate
      aria-label="Agregar antecedente"
      onSubmit={handleSubmit(submit)}
      className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4"
    >
      {add.isError && <ClinicalError error={add.error} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Tipo" required>
          {(c) => (
            <Select {...c} {...register('kind')}>
              {ALL_CONDITION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CONDITION_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Código CIE-10 (opcional)" error={errors.icd10_code?.message}>
          {(c) => <Input {...c} autoComplete="off" {...register('icd10_code')} />}
        </Field>
      </div>
      <Field label="Descripción" required error={errors.description?.message}>
        {(c) => <Input {...c} autoComplete="off" {...register('description')} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={add.isPending}>
          Guardar antecedente
        </Button>
      </div>
    </form>
  )
}

/** Antecedentes personales, familiares, quirúrgicos y hábitos. */
export function ConditionsPanel({ patientId, canWrite }: { patientId: string; canWrite: boolean }) {
  const conditions = useConditions(patientId)
  const update = useUpdateCondition(patientId)
  const [adding, setAdding] = useState(false)

  return (
    <section
      aria-labelledby="conditions-title"
      className="rounded-xl border border-slate-300 bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="conditions-title" className="text-base font-semibold text-slate-900">
          Antecedentes
        </h3>
        {canWrite && !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Agregar antecedente
          </Button>
        )}
      </div>
      {conditions.isPending && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <Spinner /> Cargando antecedentes…
        </p>
      )}
      {conditions.isError && <ClinicalError error={conditions.error} />}
      {update.isError && <ClinicalError error={update.error} />}
      {conditions.data &&
        (conditions.data.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No hay antecedentes registrados.</p>
        ) : (
          <ul className="mt-2" aria-label="Lista de antecedentes">
            {conditions.data.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-2 first:border-t-0"
              >
                <div className="text-sm">
                  <span className="text-slate-600">{CONDITION_KIND_LABELS[c.kind]}:</span>{' '}
                  <strong className={c.active ? 'text-slate-900' : 'text-slate-500 line-through'}>
                    {c.description}
                  </strong>
                  {c.icd10_code && <span className="text-slate-700"> ({c.icd10_code})</span>}{' '}
                  {!c.active && <Badge tone="neutral">Inactivo</Badge>}
                </div>
                {canWrite && (
                  <Button
                    variant="secondary"
                    className="min-h-8 px-2.5 py-1 text-xs"
                    disabled={update.isPending}
                    aria-label={`${c.active ? 'Marcar inactivo' : 'Reactivar'}: ${c.description}`}
                    onClick={() => update.mutate({ id: c.id, changes: { active: !c.active } })}
                  >
                    {c.active ? 'Marcar inactivo' : 'Reactivar'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}
      {adding && <ConditionForm patientId={patientId} onDone={() => setAdding(false)} />}
    </section>
  )
}
