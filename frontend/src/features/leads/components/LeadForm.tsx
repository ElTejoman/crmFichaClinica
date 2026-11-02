import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { ApiError } from '@/shared/lib/http'
import {
  ALL_LEAD_SOURCES,
  ALL_SPECIALTIES,
  LEAD_SOURCE_LABELS,
  SPECIALTY_LABELS,
} from '@/shared/lib/labels'
import {
  Alert,
  Button,
  CheckboxField,
  CheckboxGroup,
  Field,
  Input,
  Select,
  Textarea,
} from '@/shared/ui'

import type { AssigneeOption } from '../hooks/useAssignees'
import { leadFormSchema, type LeadFormValues } from '../schemas'
import { mapLeadApiError } from '../serverErrors'

const SPECIALTY_OPTIONS = ALL_SPECIALTIES.map((value) => ({
  value,
  label: SPECIALTY_LABELS[value],
}))

interface LeadFormProps {
  initialValues: LeadFormValues
  assignees: readonly AssigneeOption[]
  submitLabel: string
  ariaLabel: string
  /** Debe lanzar `ApiError` si el servidor rechaza. */
  onSubmit: (values: LeadFormValues) => Promise<void>
  onCancel: () => void
}

/** Formulario de lead para alta y edición. Exige teléfono o correo (sin canal no se puede trabajar). */
export function LeadForm({
  initialValues,
  assignees,
  submitLabel,
  ariaLabel,
  onSubmit,
  onCancel,
}: LeadFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: initialValues,
  })
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(values: LeadFormValues) {
    setFormError(null)
    try {
      await onSubmit(values)
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError('No se pudo guardar. Revise su conexión e intente de nuevo.')
        return
      }
      const mapped = mapLeadApiError(error)
      for (const { field, message } of mapped.fieldErrors) setError(field, { message })
      setFormError(mapped.formError)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label={ariaLabel}
      className="flex flex-col gap-4 rounded-lg border border-slate-300 bg-white p-5"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre completo" error={errors.full_name?.message} required>
          {(c) => <Input autoComplete="off" {...c} {...register('full_name')} />}
        </Field>
        <Field label="Fuente" error={errors.source?.message} required>
          {(c) => (
            <Select {...c} {...register('source')}>
              {ALL_LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Teléfono / WhatsApp"
          hint="Indique al menos un teléfono o un correo."
          error={errors.phone?.message}
        >
          {(c) => <Input type="tel" autoComplete="off" {...c} {...register('phone')} />}
        </Field>
        <Field label="Correo electrónico" error={errors.email?.message}>
          {(c) => <Input type="email" autoComplete="off" {...c} {...register('email')} />}
        </Field>
      </div>

      <Controller
        control={control}
        name="interest_specialties"
        render={({ field }) => (
          <CheckboxGroup
            legend="Especialidades de interés"
            options={SPECIALTY_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            error={errors.interest_specialties?.message}
          />
        )}
      />

      <Field label="Responsable" error={errors.assigned_to?.message}>
        {(c) => (
          <Select {...c} {...register('assigned_to')}>
            <option value="">Sin asignar</option>
            {assignees.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field
        label="Notas"
        hint="Sin datos clínicos: el CRM es solo comercial."
        error={errors.notes?.message}
      >
        {(c) => <Textarea {...c} {...register('notes')} />}
      </Field>

      <CheckboxField
        label="Autoriza recibir comunicaciones de marketing"
        hint="Sin este consentimiento no se le debe enviar publicidad (Ley N.º 29733)."
        {...register('consent_marketing')}
      />

      {formError && <Alert tone="error">{formError}</Alert>}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
