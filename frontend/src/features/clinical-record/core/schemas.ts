import { z } from 'zod'

import { isDateKey } from '@/shared/lib/dates'
import type {
  AddendumCreate,
  AllergyCreate,
  AllergySeverity,
  ConditionCreate,
  ConditionKind,
  ConsentCreate,
  ConsentMethod,
  ConsentType,
  MedicationCreate,
} from '@/shared/types/aliases'

import { normalizeIcd10Code } from './icd10'

const LABEL_MAX = 150
const REACTION_MAX = 200
const DOSE_MAX = 80
const ROUTE_MAX = 40
const FREQUENCY_MAX = 80
const REASON_MAX = 200
const ADDENDUM_TEXT_MAX = 5_000
const RELATION_MAX = 50

/** Prefijo que exige el servidor para la firma en pantalla (PNG en data URL). */
/** Tope del servidor para la imagen de la firma (caracteres del data URL). */
export const SIGNATURE_MAX_LENGTH = 400_000
export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

const maxMessage = (max: number) => `Admite hasta ${max} caracteres`
const optionalText = (max: number) => z.string().trim().max(max, maxMessage(max))
const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max, maxMessage(max))
const optionalDate = z.string().refine((v) => v === '' || isDateKey(v), 'Fecha inválida')

const severityEnum = z.enum(['MILD', 'MODERATE', 'SEVERE'])
const conditionKindEnum = z.enum(['PERSONAL', 'FAMILY', 'SURGICAL', 'HABIT'])
const consentTypeEnum = z.enum([
  'DATA_PROCESSING',
  'GENERAL_CARE',
  'ACUPUNCTURE_INVASIVE',
  'CHIROPRACTIC_MANIPULATION',
  'IV_THERAPY',
  'DENTAL_PROCEDURE',
  'PHOTO_USE',
])
const consentMethodEnum = z.enum(['ON_SCREEN', 'PAPER_SCANNED', 'VERBAL_RECORDED'])

const nullIfEmpty = (value: string): string | null => (value === '' ? null : value)

/* ---------- Alergias ---------- */

export interface AllergyFormValues {
  substance: string
  reaction: string
  severity: AllergySeverity
  verified: boolean
}

export const EMPTY_ALLERGY_VALUES: AllergyFormValues = {
  substance: '',
  reaction: '',
  severity: 'MODERATE',
  verified: false,
}

export const allergyFormSchema = z.object({
  substance: requiredText(LABEL_MAX, 'Indique la sustancia (p. ej. penicilina)'),
  reaction: optionalText(REACTION_MAX),
  severity: severityEnum,
  verified: z.boolean(),
})

export function toAllergyCreate(values: AllergyFormValues): AllergyCreate {
  return {
    substance: values.substance.trim(),
    reaction: nullIfEmpty(values.reaction.trim()),
    severity: values.severity,
    verified: values.verified,
  }
}

/* ---------- Medicación ---------- */

export interface MedicationFormValues {
  name: string
  dose: string
  route: string
  frequency: string
  since: string
  until: string
  prescriber: string
}

export const EMPTY_MEDICATION_VALUES: MedicationFormValues = {
  name: '',
  dose: '',
  route: '',
  frequency: '',
  since: '',
  until: '',
  prescriber: '',
}

export const medicationFormSchema = z
  .object({
    name: requiredText(LABEL_MAX, 'Indique el medicamento'),
    dose: optionalText(DOSE_MAX),
    route: optionalText(ROUTE_MAX),
    frequency: optionalText(FREQUENCY_MAX),
    since: optionalDate,
    until: optionalDate,
    prescriber: optionalText(LABEL_MAX),
  })
  .superRefine((values, ctx) => {
    if (values.since && values.until && values.until < values.since) {
      ctx.addIssue({
        code: 'custom',
        path: ['until'],
        message: 'La fecha de fin no puede ser anterior a la de inicio',
      })
    }
  })

export function toMedicationCreate(values: MedicationFormValues): MedicationCreate {
  return {
    name: values.name.trim(),
    dose: nullIfEmpty(values.dose.trim()),
    route: nullIfEmpty(values.route.trim()),
    frequency: nullIfEmpty(values.frequency.trim()),
    since: nullIfEmpty(values.since),
    until: nullIfEmpty(values.until),
    prescriber: nullIfEmpty(values.prescriber.trim()),
  }
}

/* ---------- Antecedentes ---------- */

export interface ConditionFormValues {
  kind: ConditionKind
  icd10_code: string
  description: string
}

export const EMPTY_CONDITION_VALUES: ConditionFormValues = {
  kind: 'PERSONAL',
  icd10_code: '',
  description: '',
}

export const conditionFormSchema = z.object({
  kind: conditionKindEnum,
  icd10_code: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || normalizeIcd10Code(v) !== null,
      'Código CIE-10 no válido (p. ej. E11.9)',
    ),
  description: requiredText(LABEL_MAX, 'Describa el antecedente'),
})

export function toConditionCreate(values: ConditionFormValues): ConditionCreate {
  const code = values.icd10_code.trim() === '' ? null : normalizeIcd10Code(values.icd10_code)
  return { kind: values.kind, icd10_code: code, description: values.description.trim() }
}

/* ---------- Adenda y revocación ---------- */

export interface AddendumFormValues {
  reason: string
  text: string
}

export const EMPTY_ADDENDUM_VALUES: AddendumFormValues = { reason: '', text: '' }

export const addendumFormSchema = z.object({
  reason: requiredText(REASON_MAX, 'Indique el motivo de la adenda'),
  text: requiredText(ADDENDUM_TEXT_MAX, 'Escriba el texto de la adenda'),
})

export function toAddendumCreate(values: AddendumFormValues): AddendumCreate {
  return { reason: values.reason.trim(), text: values.text.trim() }
}

export interface RevokeFormValues {
  reason: string
}

export const revokeFormSchema = z.object({
  reason: requiredText(REASON_MAX, 'Indique el motivo de la revocación'),
})

/* ---------- Consentimiento ---------- */

export interface ConsentFormValues {
  type: ConsentType
  method: ConsentMethod
  signed_by_name: string
  signer_relation: string
  witness_name: string
  signature_image: string
}

const CONSENT_FIELDS: readonly (keyof ConsentFormValues)[] = [
  'type',
  'method',
  'signed_by_name',
  'signer_relation',
  'witness_name',
  'signature_image',
]

export function isConsentField(key: unknown): key is keyof ConsentFormValues {
  return CONSENT_FIELDS.some((field) => field === key)
}

export function emptyConsentValues(signedByName: string): ConsentFormValues {
  return {
    type: 'GENERAL_CARE',
    method: 'ON_SCREEN',
    signed_by_name: signedByName,
    signer_relation: '',
    witness_name: '',
    signature_image: '',
  }
}

/**
 * Reglas de captura que se pueden validar en el cliente. La regla de "verbal no vale para
 * procedimientos de riesgo" la impone y explica el servidor (`consent_rule_violation`).
 */
export function makeConsentFormSchema(options: { isMinor: boolean }) {
  return z
    .object({
      type: consentTypeEnum,
      method: consentMethodEnum,
      signed_by_name: requiredText(LABEL_MAX, 'Indique quién firma'),
      signer_relation: optionalText(RELATION_MAX),
      witness_name: optionalText(LABEL_MAX),
      signature_image: z
        .string()
        .max(SIGNATURE_MAX_LENGTH, 'La firma es demasiado grande: bórrela y firme de nuevo'),
    })
    .superRefine((values, ctx) => {
      if (options.isMinor && values.signer_relation === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['signer_relation'],
          message: 'El paciente es menor de edad: firma su apoderado (indique la relación)',
        })
      }
      if (
        values.method === 'ON_SCREEN' &&
        !values.signature_image.startsWith(PNG_DATA_URL_PREFIX)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['signature_image'],
          message: 'Falta la firma en pantalla',
        })
      }
    })
}

export function toConsentCreate(values: ConsentFormValues): ConsentCreate {
  return {
    type: values.type,
    method: values.method,
    signed_by_name: values.signed_by_name.trim(),
    signer_relation: nullIfEmpty(values.signer_relation.trim()),
    witness_name: nullIfEmpty(values.witness_name.trim()),
    // Solo la firma en pantalla lleva imagen; en los demás métodos se descarta aunque quedara dibujada.
    signature_image: values.method === 'ON_SCREEN' ? values.signature_image : null,
  }
}
