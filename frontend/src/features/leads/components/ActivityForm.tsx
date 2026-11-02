import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { localInputToIso } from '@/shared/lib/dates'
import { ApiError } from '@/shared/lib/http'
import { ACTIVITY_TYPE_LABELS, REGISTRABLE_ACTIVITY_TYPES } from '@/shared/lib/labels'
import { Alert, Button, Field, Input, Select, Textarea } from '@/shared/ui'

import { useAddActivity } from '../api/useLeads'
import { activityFormSchema, EMPTY_ACTIVITY_VALUES, type ActivityFormValues } from '../schemas'

/**
 * Registrar una llamada, WhatsApp, correo o nota. La "próxima acción" se captura como fecha/hora
 * local y viaja como ISO con zona (el servidor rechaza fechas ambiguas). Ojo: el servidor fija la
 * próxima acción del lead con la de la ÚLTIMA actividad; dejarla vacía borra el pendiente anterior.
 */
export function ActivityForm({ leadId }: { leadId: string }) {
  const addActivity = useAddActivity(leadId)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: EMPTY_ACTIVITY_VALUES,
  })

  async function submit(values: ActivityFormValues) {
    setError(null)
    try {
      await addActivity.mutateAsync({
        type: values.type,
        notes: values.notes || null,
        next_action_at: localInputToIso(values.next_action_at),
      })
      reset(EMPTY_ACTIVITY_VALUES)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo registrar la actividad.')
    }
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label="Registrar actividad"
      className="flex flex-col gap-4 rounded-lg border border-slate-300 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-slate-900">Registrar actividad</h2>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tipo" required>
          {(c) => (
            <Select {...c} {...register('type')}>
              {REGISTRABLE_ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Próxima acción"
          hint="Si lo deja vacío, se borra la próxima acción anterior."
          error={errors.next_action_at?.message}
        >
          {(c) => <Input type="datetime-local" {...c} {...register('next_action_at')} />}
        </Field>
      </div>
      <Field label="Notas" hint="Sin datos clínicos." error={errors.notes?.message}>
        {(c) => <Textarea {...c} {...register('notes')} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={addActivity.isPending}>
          Registrar actividad
        </Button>
      </div>
    </form>
  )
}
