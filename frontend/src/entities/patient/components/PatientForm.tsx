import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { limaDateKey } from '@/shared/lib/dates'
import { ApiError } from '@/shared/lib/http'
import {
  ALL_DOCUMENT_TYPES,
  ALL_LEAD_SOURCES,
  ALL_MARITAL_STATUSES,
  ALL_SEXES,
  DOCUMENT_TYPE_LABELS,
  LEAD_SOURCE_LABELS,
  MARITAL_STATUS_LABELS,
  SEX_LABELS,
} from '@/shared/lib/labels'
import { Alert, Button, CheckboxField, Field, Input, Select } from '@/shared/ui'

import { usePatientDuplicates } from '../api/usePatientDuplicates'
import { calculateAge, isMinor } from '../age'
import { buildDuplicateQuery } from '../duplicates'
import { makePatientFormSchema, type PatientFormMode, type PatientFormValues } from '../schemas'
import { mapPatientApiError, type PatientErrorMapping } from '../serverErrors'
import { DuplicateWarning } from './DuplicateWarning'

const DUPLICATE_DEBOUNCE_MS = 600

interface PatientFormProps {
  mode: PatientFormMode
  initialValues: PatientFormValues
  submitLabel: string
  /** Debe lanzar `ApiError` si el servidor rechaza; el formulario ubica el error en su campo. */
  onSubmit: (values: PatientFormValues) => Promise<void>
  onCancel?: () => void
  /** Texto que identifica el formulario para lectores de pantalla. */
  ariaLabel: string
}

const SECTION = 'flex flex-col gap-4 rounded-lg border border-slate-300 bg-white p-5'
const LEGEND = 'px-1 text-base font-semibold text-slate-900'

/**
 * Formulario de paciente compartido por alta, edición y conversión de leads. Por secciones:
 * Identificación · Contacto · Contacto de emergencia · Apoderado (solo menores, obligatorio)
 * · Consentimiento (solo alta). El servidor valida de nuevo; aquí se adelanta el aviso.
 */
export function PatientForm({
  mode,
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
  ariaLabel,
}: PatientFormProps) {
  const schema = useMemo(() => makePatientFormSchema(mode), [mode])
  const {
    register,
    handleSubmit,
    control,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
  })
  const [serverState, setServerState] = useState<PatientErrorMapping | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const watched = useWatch({ control })
  const today = limaDateKey()
  const birthDate = watched.birth_date ?? ''
  const age = calculateAge(birthDate, today)
  const minor = isMinor(birthDate, today)

  const duplicateQuery = useDebouncedValue(
    mode === 'create'
      ? buildDuplicateQuery(
          {
            first_name: watched.first_name ?? '',
            last_name: watched.last_name ?? '',
            birth_date: birthDate,
            phone: watched.phone ?? '',
          },
          today,
        )
      : null,
    DUPLICATE_DEBOUNCE_MS,
  )
  const duplicates = usePatientDuplicates(duplicateQuery)

  useEffect(() => {
    if (!serverState?.formError && !serverState?.existingPatient) return
    errorRef.current?.focus()
    errorRef.current?.scrollIntoView?.({ block: 'center' })
  }, [serverState])

  async function submit(values: PatientFormValues) {
    setServerState(null)
    try {
      await onSubmit(values)
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setServerState({
          fieldErrors: [],
          formError: 'No se pudo guardar. Revise su conexión e intente de nuevo.',
          existingPatient: null,
        })
        return
      }
      const mapped = mapPatientApiError(error)
      for (const { field, message } of mapped.fieldErrors) setError(field, { message })
      const firstField = mapped.fieldErrors[0]?.field
      if (firstField && !mapped.formError && !mapped.existingPatient) setFocus(firstField)
      setServerState(mapped)
    }
  }

  const isCreate = mode === 'create'

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label={ariaLabel}
      className="flex flex-col gap-5"
    >
      <fieldset className={SECTION}>
        <legend className={LEGEND}>Identificación</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tipo de documento" required>
            {(c) =>
              isCreate ? (
                <Select {...c} {...register('document_type')}>
                  {ALL_DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {DOCUMENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              ) : (
                // Un control deshabilitado y registrado en RHF enviaría `undefined`; el documento
                // no es editable, así que se muestra aparte y el valor original queda en el estado.
                <Select {...c} value={initialValues.document_type} disabled>
                  <option value={initialValues.document_type}>
                    {DOCUMENT_TYPE_LABELS[initialValues.document_type]}
                  </option>
                </Select>
              )
            }
          </Field>
          <Field
            label="N.º de documento"
            error={errors.document_number?.message}
            hint={isCreate ? undefined : 'El documento no se puede modificar.'}
            required
          >
            {(c) =>
              isCreate ? (
                <Input autoComplete="off" {...c} {...register('document_number')} />
              ) : (
                <Input {...c} value={initialValues.document_number} disabled readOnly />
              )
            }
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombres" error={errors.first_name?.message} required>
            {(c) => <Input autoComplete="off" {...c} {...register('first_name')} />}
          </Field>
          <Field label="Apellidos" error={errors.last_name?.message} required>
            {(c) => <Input autoComplete="off" {...c} {...register('last_name')} />}
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label="Fecha de nacimiento"
            error={errors.birth_date?.message}
            hint={
              age !== null && age >= 0
                ? `Edad: ${age} ${age === 1 ? 'año' : 'años'}${minor ? ' · menor de edad' : ''}`
                : undefined
            }
            required
          >
            {(c) => <Input type="date" max={today} {...c} {...register('birth_date')} />}
          </Field>
          <Field label="Sexo" error={errors.sex?.message} required>
            {(c) => (
              <Select {...c} {...register('sex')}>
                <option value="">Seleccione…</option>
                {ALL_SEXES.map((s) => (
                  <option key={s} value={s}>
                    {SEX_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Estado civil" error={errors.marital_status?.message}>
            {(c) => (
              <Select {...c} {...register('marital_status')}>
                <option value="">Sin especificar</option>
                {ALL_MARITAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MARITAL_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {isCreate && duplicates.data && <DuplicateWarning candidates={duplicates.data} />}
      </fieldset>

      <fieldset className={SECTION}>
        <legend className={LEGEND}>Contacto</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Teléfono"
            hint="Celular de 9 dígitos o internacional con +."
            error={errors.phone?.message}
          >
            {(c) => <Input type="tel" autoComplete="off" {...c} {...register('phone')} />}
          </Field>
          <Field label="Correo electrónico" error={errors.email?.message}>
            {(c) => <Input type="email" autoComplete="off" {...c} {...register('email')} />}
          </Field>
          <Field label="Dirección" error={errors.address?.message}>
            {(c) => <Input autoComplete="off" {...c} {...register('address')} />}
          </Field>
          <Field label="Distrito" error={errors.district?.message}>
            {(c) => <Input autoComplete="off" {...c} {...register('district')} />}
          </Field>
          <Field label="Ocupación" error={errors.occupation?.message}>
            {(c) => <Input autoComplete="off" {...c} {...register('occupation')} />}
          </Field>
          <Field label="Seguro" error={errors.insurance?.message}>
            {(c) => <Input autoComplete="off" {...c} {...register('insurance')} />}
          </Field>
          <Field label="¿Cómo nos conoció?" error={errors.referral_source?.message}>
            {(c) => (
              <Select {...c} {...register('referral_source')}>
                <option value="">Sin especificar</option>
                {ALL_LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className={SECTION}>
        <legend className={LEGEND}>Contacto de emergencia</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Nombre" error={errors.emergency_contact?.name?.message}>
            {(c) => <Input autoComplete="off" {...c} {...register('emergency_contact.name')} />}
          </Field>
          <Field label="Teléfono" error={errors.emergency_contact?.phone?.message}>
            {(c) => (
              <Input
                type="tel"
                autoComplete="off"
                {...c}
                {...register('emergency_contact.phone')}
              />
            )}
          </Field>
          <Field label="Parentesco" error={errors.emergency_contact?.relation?.message}>
            {(c) => <Input autoComplete="off" {...c} {...register('emergency_contact.relation')} />}
          </Field>
        </div>
      </fieldset>

      {minor && (
        <fieldset className={`${SECTION} border-amber-300 bg-amber-50`}>
          <legend className={LEGEND}>Apoderado</legend>
          <Alert tone="warning">
            El paciente es menor de 18 años: los datos del apoderado son obligatorios.
          </Alert>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre del apoderado" error={errors.guardian?.name?.message} required>
              {(c) => <Input autoComplete="off" {...c} {...register('guardian.name')} />}
            </Field>
            <Field label="Parentesco" error={errors.guardian?.relation?.message} required>
              {(c) => <Input autoComplete="off" {...c} {...register('guardian.relation')} />}
            </Field>
            <Field label="Tipo de documento del apoderado" required>
              {(c) => (
                <Select {...c} {...register('guardian.document_type')}>
                  {ALL_DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {DOCUMENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="N.º de documento del apoderado"
              error={errors.guardian?.document_number?.message}
              required
            >
              {(c) => <Input autoComplete="off" {...c} {...register('guardian.document_number')} />}
            </Field>
            <Field label="Teléfono del apoderado" error={errors.guardian?.phone?.message} required>
              {(c) => (
                <Input type="tel" autoComplete="off" {...c} {...register('guardian.phone')} />
              )}
            </Field>
          </div>
        </fieldset>
      )}

      {isCreate && (
        <fieldset className={SECTION}>
          <legend className={LEGEND}>Consentimiento de tratamiento de datos</legend>
          <p className="text-sm text-slate-700">
            Sus datos personales y de salud se usarán para brindarle atención en la clínica, con
            acceso restringido y auditado, conforme a la Ley N.º 29733 de Protección de Datos
            Personales. Puede ejercer sus derechos de acceso, rectificación, cancelación y oposición
            (ARCO) cuando lo desee. <em>(Texto de ejemplo, no es un documento legal.)</em>
          </p>
          <CheckboxField
            label="El paciente (o su apoderado) autoriza el tratamiento de sus datos personales"
            error={errors.data_processing_consent?.message}
            {...register('data_processing_consent')}
          />
        </fieldset>
      )}

      <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
        {serverState?.formError && <Alert tone="error">{serverState.formError}</Alert>}
        {serverState?.existingPatient && (
          <Alert tone="error">
            Ya existe un paciente con ese documento:{' '}
            <Link
              to={`/pacientes/${serverState.existingPatient.id}`}
              className="font-medium underline"
            >
              {serverState.existingPatient.fullName}
            </Link>
            .
          </Alert>
        )}
      </div>

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
