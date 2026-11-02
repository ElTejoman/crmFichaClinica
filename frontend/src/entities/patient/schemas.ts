import { z } from 'zod'

import { limaDateKey } from '@/shared/lib/dates'
import { isValidPhone, PHONE_ERROR_MESSAGE } from '@/shared/lib/phone'
import type {
  DocumentType,
  LeadSource,
  MaritalStatus,
  PatientCreate,
  PatientRead,
  PatientUpdate,
  Sex,
} from '@/shared/types/aliases'

import { calculateAge, isMinor, MAX_PLAUSIBLE_AGE, parseIsoDate } from './age'
import { documentError } from './document'

const NAME_MAX = 100
const CONTACT_NAME_MAX = 150
const RELATION_MAX = 50
const OCCUPATION_MAX = 120
const ADDRESS_MAX = 250
const DISTRICT_MAX = 80
const INSURANCE_MAX = 120
const CONSENT_REQUIRED_MESSAGE =
  'Debe confirmar que el paciente autoriza el tratamiento de sus datos personales'

export type PatientFormMode = 'create' | 'edit'

export interface PatientFormValues {
  document_type: DocumentType
  document_number: string
  first_name: string
  last_name: string
  birth_date: string
  sex: Sex | ''
  marital_status: MaritalStatus | ''
  occupation: string
  address: string
  district: string
  phone: string
  email: string
  insurance: string
  referral_source: LeadSource | ''
  emergency_contact: { name: string; phone: string; relation: string }
  guardian: {
    name: string
    document_type: DocumentType
    document_number: string
    phone: string
    relation: string
  }
  data_processing_consent: boolean
}

export const EMPTY_PATIENT_VALUES: PatientFormValues = {
  document_type: 'DNI',
  document_number: '',
  first_name: '',
  last_name: '',
  birth_date: '',
  sex: '',
  marital_status: '',
  occupation: '',
  address: '',
  district: '',
  phone: '',
  email: '',
  insurance: '',
  referral_source: '',
  emergency_contact: { name: '', phone: '', relation: '' },
  guardian: { name: '', document_type: 'DNI', document_number: '', phone: '', relation: '' },
  data_processing_consent: false,
}

const documentTypeSchema = z.enum(['DNI', 'CE', 'PASSPORT', 'OTHER'])
const optionalText = (max: number) => z.string().trim().max(max, `Admite hasta ${max} caracteres`)

const patientFormShape = z.object({
  document_type: documentTypeSchema,
  document_number: z.string().trim(),
  first_name: z
    .string()
    .trim()
    .min(1, 'Ingrese los nombres')
    .max(NAME_MAX, `Admite hasta ${NAME_MAX} caracteres`),
  last_name: z
    .string()
    .trim()
    .min(1, 'Ingrese los apellidos')
    .max(NAME_MAX, `Admite hasta ${NAME_MAX} caracteres`),
  birth_date: z.string(),
  sex: z.union([z.enum(['FEMALE', 'MALE', 'OTHER']), z.literal('')]),
  marital_status: z.union([
    z.enum(['SINGLE', 'MARRIED', 'COHABITING', 'DIVORCED', 'WIDOWED']),
    z.literal(''),
  ]),
  occupation: optionalText(OCCUPATION_MAX),
  address: optionalText(ADDRESS_MAX),
  district: optionalText(DISTRICT_MAX),
  phone: z.string().trim(),
  email: z.string().trim(),
  insurance: optionalText(INSURANCE_MAX),
  referral_source: z.union([
    z.enum(['WEB', 'REFERRAL', 'INSTAGRAM', 'FACEBOOK', 'WALK_IN', 'OTHER']),
    z.literal(''),
  ]),
  emergency_contact: z.object({
    name: optionalText(CONTACT_NAME_MAX),
    phone: z.string().trim(),
    relation: optionalText(RELATION_MAX),
  }),
  guardian: z.object({
    name: optionalText(CONTACT_NAME_MAX),
    document_type: documentTypeSchema,
    document_number: z.string().trim(),
    phone: z.string().trim(),
    relation: optionalText(RELATION_MAX),
  }),
  data_processing_consent: z.boolean(),
})

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string) {
  ctx.addIssue({ code: 'custom', path, message })
}

function checkBirthDate(value: string, today: string, ctx: z.RefinementCtx) {
  if (!value) return addIssue(ctx, ['birth_date'], 'Ingrese la fecha de nacimiento')
  if (!parseIsoDate(value)) return addIssue(ctx, ['birth_date'], 'Ingrese una fecha válida')
  const age = calculateAge(value, today)
  if (age === null || age < 0) {
    return addIssue(ctx, ['birth_date'], 'La fecha de nacimiento no puede ser futura')
  }
  if (age > MAX_PLAUSIBLE_AGE) {
    addIssue(ctx, ['birth_date'], 'La fecha de nacimiento no es plausible')
  }
}

function checkOptionalPhone(value: string, path: string[], ctx: z.RefinementCtx) {
  if (value && !isValidPhone(value)) addIssue(ctx, path, PHONE_ERROR_MESSAGE)
}

function checkEmergencyContact(
  contact: PatientFormValues['emergency_contact'],
  ctx: z.RefinementCtx,
) {
  const touched = Boolean(contact.name || contact.phone || contact.relation)
  if (!touched) return
  if (!contact.name) addIssue(ctx, ['emergency_contact', 'name'], 'Ingrese el nombre del contacto')
  if (!contact.phone)
    addIssue(ctx, ['emergency_contact', 'phone'], 'Ingrese el teléfono del contacto')
  else checkOptionalPhone(contact.phone, ['emergency_contact', 'phone'], ctx)
}

/** El apoderado es OBLIGATORIO para menores de 18 años (norma de consentimiento de menores). */
function checkGuardian(guardian: PatientFormValues['guardian'], ctx: z.RefinementCtx) {
  const required = 'Campo obligatorio para pacientes menores de edad'
  if (!guardian.name) addIssue(ctx, ['guardian', 'name'], 'Ingrese el nombre del apoderado')
  if (!guardian.document_number) {
    addIssue(ctx, ['guardian', 'document_number'], 'Ingrese el documento del apoderado')
  } else {
    const message = documentError(guardian.document_type, guardian.document_number)
    if (message) addIssue(ctx, ['guardian', 'document_number'], message)
  }
  if (!guardian.phone) addIssue(ctx, ['guardian', 'phone'], 'Ingrese el teléfono del apoderado')
  else checkOptionalPhone(guardian.phone, ['guardian', 'phone'], ctx)
  if (!guardian.relation) addIssue(ctx, ['guardian', 'relation'], required)
}

/**
 * Esquema del formulario de paciente. Replica las reglas del servidor para avisar al instante:
 * documento por tipo, fecha de nacimiento, apoderado si es menor y consentimiento (solo al crear).
 * `today` se inyecta para que las pruebas no dependan del reloj.
 */
export function makePatientFormSchema(mode: PatientFormMode, today: () => string = limaDateKey) {
  return patientFormShape.superRefine((values, ctx) => {
    const now = today()
    if (mode === 'create') {
      if (!values.document_number)
        addIssue(ctx, ['document_number'], 'Ingrese el número de documento')
      else {
        const message = documentError(values.document_type, values.document_number)
        if (message) addIssue(ctx, ['document_number'], message)
      }
      if (!values.data_processing_consent) {
        addIssue(ctx, ['data_processing_consent'], CONSENT_REQUIRED_MESSAGE)
      }
    }
    checkBirthDate(values.birth_date, now, ctx)
    if (!values.sex) addIssue(ctx, ['sex'], 'Seleccione el sexo')
    checkOptionalPhone(values.phone, ['phone'], ctx)
    if (values.email && !z.email().safeParse(values.email).success) {
      addIssue(ctx, ['email'], 'Ingrese un correo válido')
    }
    checkEmergencyContact(values.emergency_contact, ctx)
    if (isMinor(values.birth_date, now)) checkGuardian(values.guardian, ctx)
  })
}

/* ---------- Conversión formulario <-> contrato ---------- */

const orNull = (value: string): string | null => value.trim() || null

function hasGuardianData(guardian: PatientFormValues['guardian']): boolean {
  return Boolean(guardian.name || guardian.document_number || guardian.phone || guardian.relation)
}

function buildEmergencyContact(values: PatientFormValues): PatientCreate['emergency_contact'] {
  const { name, phone, relation } = values.emergency_contact
  return name || phone ? { name, phone, relation: orNull(relation) } : null
}

function buildGuardian(values: PatientFormValues): PatientCreate['guardian'] {
  const { guardian } = values
  return hasGuardianData(guardian)
    ? {
        name: guardian.name,
        document_type: guardian.document_type,
        document_number: guardian.document_number,
        phone: guardian.phone,
        relation: guardian.relation,
      }
    : null
}

/** Valores del formulario -> `PatientCreate`. Los textos vacíos viajan como `null`. */
export function toPatientCreate(values: PatientFormValues): PatientCreate {
  return {
    document_type: values.document_type,
    document_number: values.document_number,
    first_name: values.first_name,
    last_name: values.last_name,
    birth_date: values.birth_date,
    // Los `''` ya no existen aquí: el esquema exigió sexo; el cast documenta ese contrato.
    sex: values.sex as Sex,
    marital_status: values.marital_status || null,
    occupation: orNull(values.occupation),
    address: orNull(values.address),
    district: orNull(values.district),
    phone: orNull(values.phone),
    email: orNull(values.email),
    insurance: orNull(values.insurance),
    referral_source: values.referral_source || null,
    emergency_contact: buildEmergencyContact(values),
    guardian: buildGuardian(values),
    data_processing_consent: values.data_processing_consent,
  }
}

/** Ficha existente -> valores del formulario de edición. */
export function patientToFormValues(patient: PatientRead): PatientFormValues {
  return {
    document_type: patient.document_type,
    document_number: patient.document_number,
    first_name: patient.first_name,
    last_name: patient.last_name,
    birth_date: patient.birth_date,
    sex: patient.sex,
    marital_status: patient.marital_status ?? '',
    occupation: patient.occupation ?? '',
    address: patient.address ?? '',
    district: patient.district ?? '',
    phone: patient.phone ?? '',
    email: patient.email ?? '',
    insurance: patient.insurance ?? '',
    referral_source: patient.referral_source ?? '',
    emergency_contact: {
      name: patient.emergency_contact?.name ?? '',
      phone: patient.emergency_contact?.phone ?? '',
      relation: patient.emergency_contact?.relation ?? '',
    },
    guardian: {
      name: patient.guardian?.name ?? '',
      document_type: patient.guardian?.document_type ?? 'DNI',
      document_number: patient.guardian?.document_number ?? '',
      phone: patient.guardian?.phone ?? '',
      relation: patient.guardian?.relation ?? '',
    },
    data_processing_consent: true, // ya otorgado al crear; no se edita
  }
}

const SIMPLE_UPDATE_FIELDS = [
  'first_name',
  'last_name',
  'birth_date',
  'sex',
  'marital_status',
  'occupation',
  'address',
  'district',
  'phone',
  'email',
  'insurance',
  'referral_source',
] as const

/**
 * Diferencias entre lo cargado y lo editado, como `PatientUpdate`. El API aplica los campos
 * enviados (incluso `null` para vaciar), así que se envían SOLO los que cambiaron: mandar todo
 * pisaría con datos viejos lo que otra persona haya editado entre tanto.
 */
export function toPatientUpdate(
  initial: PatientFormValues,
  current: PatientFormValues,
): PatientUpdate {
  const create = toPatientCreate({ ...current, data_processing_consent: true })
  const before = toPatientCreate({ ...initial, data_processing_consent: true })
  const changes: PatientUpdate = {}
  for (const key of SIMPLE_UPDATE_FIELDS) {
    if (create[key] !== before[key]) Object.assign(changes, { [key]: create[key] })
  }
  if (JSON.stringify(create.emergency_contact) !== JSON.stringify(before.emergency_contact)) {
    changes.emergency_contact = create.emergency_contact
  }
  if (JSON.stringify(create.guardian) !== JSON.stringify(before.guardian)) {
    changes.guardian = create.guardian
  }
  return changes
}
