import { useMemo, useState } from 'react'

import type { ConsentTemplateRead, ConsentType, PatientRead } from '@/shared/types/aliases'
import { Alert, Button, Dialog, Field, Input, Select, Spinner } from '@/shared/ui'

import { useCaptureConsent, useConsentTemplates } from '../api/useConsents'
import {
  ALL_CONSENT_METHODS,
  ALL_CONSENT_TYPES,
  CONSENT_METHOD_LABELS,
  CONSENT_TYPE_LABELS,
} from '../labels'
import {
  emptyConsentValues,
  isConsentField,
  makeConsentFormSchema,
  toConsentCreate,
  type ConsentFormValues,
} from '../schemas'
import { ClinicalError } from './ClinicalError'
import { SignaturePad } from './SignaturePad'

type FieldErrors = Partial<Record<keyof ConsentFormValues, string>>

export interface ConsentPatient {
  fullName: string
  isMinor: boolean
  guardian: PatientRead['guardian']
}

interface ConsentCaptureDialogProps {
  open: boolean
  onClose: () => void
  patientId: string
  patient: ConsentPatient
  onCaptured: () => void
}

/** Texto vigente por tipo = la versión más alta de la plantilla. */
function latestTemplate(templates: readonly ConsentTemplateRead[], type: ConsentType) {
  return templates
    .filter((t) => t.type === type)
    .reduce<ConsentTemplateRead | undefined>(
      (best, t) => (best === undefined || t.version > best.version ? t : best),
      undefined,
    )
}

export function ConsentCaptureDialog(props: ConsentCaptureDialogProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Registrar consentimiento"
      description="Lea o muestre el texto al paciente y registre cómo lo aceptó."
      size="xl"
    >
      {props.open && <CaptureForm {...props} />}
    </Dialog>
  )
}

function initialValues(patient: ConsentPatient): ConsentFormValues {
  const base = emptyConsentValues(patient.fullName)
  // En un menor firma su apoderado: se precarga con sus datos si ya están en la ficha.
  if (patient.isMinor) {
    return {
      ...base,
      signed_by_name: patient.guardian?.name ?? '',
      signer_relation: patient.guardian?.relation ?? '',
    }
  }
  return base
}

function CaptureForm({ onClose, patientId, patient, onCaptured }: ConsentCaptureDialogProps) {
  const templates = useConsentTemplates(true)
  const capture = useCaptureConsent(patientId)
  const [values, setValues] = useState<ConsentFormValues>(() => initialValues(patient))
  const [errors, setErrors] = useState<FieldErrors>({})
  const schema = useMemo(
    () => makeConsentFormSchema({ isMinor: patient.isMinor }),
    [patient.isMinor],
  )
  const template = templates.data ? latestTemplate(templates.data, values.type) : undefined

  function set<K extends keyof ConsentFormValues>(key: K, value: ConsentFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  async function submit() {
    const parsed = schema.safeParse(values)
    if (!parsed.success) {
      const next: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (isConsentField(key) && next[key] === undefined) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    try {
      await capture.mutateAsync(toConsentCreate(values))
      onCaptured()
      onClose()
    } catch {
      // El mensaje del servidor (p. ej. «verbal no vale para este procedimiento») se muestra arriba.
    }
  }

  const signerLabel = patient.isMinor ? 'Nombre del apoderado que firma' : 'Nombre de quien firma'

  return (
    <form
      noValidate
      aria-label="Registrar consentimiento"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-4"
    >
      {capture.isError && <ClinicalError error={capture.error} />}
      {patient.isMinor && (
        <Alert tone="warning">
          El paciente es menor de edad: firma su apoderado. Indique su nombre y su relación con el
          paciente.
        </Alert>
      )}

      <Field label="Tipo de consentimiento" required>
        {(c) => (
          <Select
            {...c}
            value={values.type}
            onChange={(event) => {
              const type = ALL_CONSENT_TYPES.find((t) => t === event.target.value)
              if (type) set('type', type)
            }}
          >
            {ALL_CONSENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONSENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <section aria-label="Texto del consentimiento" className="flex flex-col gap-1">
        {templates.isPending && (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <Spinner /> Cargando texto…
          </p>
        )}
        {templates.isError && <ClinicalError error={templates.error} />}
        {templates.data && !template && (
          <Alert tone="warning">No hay un texto vigente para este tipo de consentimiento.</Alert>
        )}
        {template && (
          <>
            <h3 className="text-sm font-semibold text-slate-900">
              {template.title}{' '}
              <span className="font-normal text-slate-600">(versión {template.version})</span>
            </h3>
            {/* Se muestra TAL CUAL viene del servidor, incluida la leyenda de «ejemplo, no legal». */}
            <div
              tabIndex={0}
              role="region"
              aria-label={`Texto: ${template.title}`}
              className="max-h-56 overflow-y-auto rounded-md border border-slate-300 bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              {template.body}
            </div>
          </>
        )}
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-800">Método de aceptación</legend>
        <div className="flex flex-wrap gap-4">
          {ALL_CONSENT_METHODS.map((method) => (
            <label key={method} className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name="consent-method"
                className="size-4 accent-brand-700"
                checked={values.method === method}
                onChange={() => set('method', method)}
              />
              {CONSENT_METHOD_LABELS[method]}
            </label>
          ))}
        </div>
        {values.method === 'PAPER_SCANNED' && (
          <p className="text-sm text-slate-700">
            Registre que el paciente firmó el documento en papel. Conserve el documento escaneado.
          </p>
        )}
        {values.method === 'VERBAL_RECORDED' && (
          <p className="text-sm text-slate-700">
            Solo vale para atención general y fotografías; en procedimientos de riesgo se exige
            firma o documento escaneado.
          </p>
        )}
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={signerLabel} required error={errors.signed_by_name}>
          {(c) => (
            <Input
              {...c}
              autoComplete="off"
              value={values.signed_by_name}
              onChange={(event) => set('signed_by_name', event.target.value)}
            />
          )}
        </Field>
        <Field
          label="Relación con el paciente"
          required={patient.isMinor}
          hint={patient.isMinor ? undefined : 'Solo si firma un tercero (p. ej. apoderado).'}
          error={errors.signer_relation}
        >
          {(c) => (
            <Input
              {...c}
              autoComplete="off"
              value={values.signer_relation}
              onChange={(event) => set('signer_relation', event.target.value)}
            />
          )}
        </Field>
        <Field label="Testigo (opcional)" error={errors.witness_name}>
          {(c) => (
            <Input
              {...c}
              autoComplete="off"
              value={values.witness_name}
              onChange={(event) => set('witness_name', event.target.value)}
            />
          )}
        </Field>
      </div>

      {values.method === 'ON_SCREEN' && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-slate-800">
            Firma{' '}
            <span aria-hidden="true" className="text-red-700">
              *
            </span>
          </p>
          <SignaturePad
            value={values.signature_image}
            onChange={(dataUrl) => set('signature_image', dataUrl)}
            invalid={Boolean(errors.signature_image)}
          />
          {errors.signature_image && (
            <p role="alert" className="text-sm text-red-700">
              {errors.signature_image}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={capture.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={capture.isPending}>
          Registrar consentimiento
        </Button>
      </div>
    </form>
  )
}
