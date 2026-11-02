import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { WEEKDAY_LABELS } from '@/shared/lib/labels'
import { Alert, Button, Field, Input, Select } from '@/shared/ui'

import { scheduleFormSchema, type ScheduleFormValues } from '../schemas'
import { mapConfigError } from './formHelpers'

interface ScheduleFormProps {
  initialValues: ScheduleFormValues
  submitLabel: string
  /** Debe lanzar el error del servidor si rechaza (se muestra en el formulario). */
  onSubmit: (values: ScheduleFormValues) => Promise<void>
  onCancel: () => void
}

/** Bloque semanal de trabajo de un doctor: día, horas, minutos por cita y vigencia opcional. */
export function ScheduleForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: initialValues,
  })
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(values: ScheduleFormValues) {
    setFormError(null)
    try {
      await onSubmit(values)
    } catch (error) {
      setFormError(mapConfigError(error).message)
    }
  }

  return (
    <form
      noValidate
      aria-label="Bloque de horario"
      onSubmit={(event) => void handleSubmit(submit)(event)}
      className="flex flex-col gap-4"
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Día de la semana" error={errors.weekday?.message} required>
        {(c) => (
          <Select {...register('weekday')} {...c}>
            {WEEKDAY_LABELS.map((label, index) => (
              <option key={label} value={String(index)}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Hora de inicio" error={errors.start_time?.message} required>
          {(c) => <Input type="time" {...register('start_time')} {...c} />}
        </Field>
        <Field label="Hora de fin" error={errors.end_time?.message} required>
          {(c) => <Input type="time" {...register('end_time')} {...c} />}
        </Field>
        <Field
          label="Minutos por cita"
          error={errors.slot_minutes?.message}
          hint="Intervalo entre huecos."
          required
        >
          {(c) => <Input inputMode="numeric" {...register('slot_minutes')} {...c} />}
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vigente desde (opcional)" error={errors.valid_from?.message}>
          {(c) => <Input type="date" {...register('valid_from')} {...c} />}
        </Field>
        <Field label="Vigente hasta (opcional)" error={errors.valid_to?.message}>
          {(c) => <Input type="date" {...register('valid_to')} {...c} />}
        </Field>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
