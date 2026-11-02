import type { Path } from 'react-hook-form'

import { ApiError } from '@/shared/lib/http'

import type { PatientFormValues } from './schemas'

type FormField = Path<PatientFormValues>

export interface PatientErrorMapping {
  /** Errores atribuibles a un campo concreto. */
  fieldErrors: { field: FormField; message: string }[]
  /** Mensaje general (siempre legible); `null` si todo quedó asignado a campos. */
  formError: string | null
  /** Paciente ya registrado con el mismo documento, para enlazarlo. */
  existingPatient: { id: string; fullName: string } | null
}

const KNOWN_FIELDS: ReadonlySet<string> = new Set<FormField>([
  'document_type',
  'document_number',
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
  'emergency_contact.name',
  'emergency_contact.phone',
  'emergency_contact.relation',
  'guardian.name',
  'guardian.document_type',
  'guardian.document_number',
  'guardian.phone',
  'guardian.relation',
  'data_processing_consent',
])

const DOCUMENT_EXISTS = 'patient_document_exists'
const GUARDIAN_REQUIRED = 'guardian_required'
const INVALID_BIRTH_DATE = 'invalid_birth_date'
const WRAPPER_KEY = 'patient' // al convertir un lead el cuerpo es {patient: {...}}

function asField(path: readonly string[]): FormField | null {
  const parts = path[0] === WRAPPER_KEY ? path.slice(1) : path
  const joined = parts.join('.')
  return KNOWN_FIELDS.has(joined) ? (joined as FormField) : null
}

function existingFrom(details: ApiError['details']): PatientErrorMapping['existingPatient'] {
  if (typeof details?.patient_id !== 'string') return null
  const fullName = typeof details.full_name === 'string' ? details.full_name : 'Ver paciente'
  return { id: details.patient_id, fullName }
}

/**
 * Traduce los errores del servidor al formulario de paciente (alta, edición y conversión):
 *  - 409 documento repetido  -> campo documento + enlace al paciente existente;
 *  - 422 `guardian_required` / `invalid_birth_date` -> campo y aviso general;
 *  - 422 de validación (Pydantic) -> cada campo conocido; lo demás, un mensaje general.
 * Nunca se descarta un error: lo que no se puede ubicar en un campo termina en `formError`.
 */
export function mapPatientApiError(error: ApiError): PatientErrorMapping {
  const mapping: PatientErrorMapping = { fieldErrors: [], formError: null, existingPatient: null }

  if (error.details?.code === DOCUMENT_EXISTS) {
    mapping.fieldErrors.push({ field: 'document_number', message: error.message })
    mapping.existingPatient = existingFrom(error.details)
    return mapping
  }
  if (error.code === GUARDIAN_REQUIRED) {
    mapping.fieldErrors.push({ field: 'guardian.name', message: error.message })
    mapping.formError = error.message
    return mapping
  }
  if (error.code === INVALID_BIRTH_DATE) {
    mapping.fieldErrors.push({ field: 'birth_date', message: error.message })
    return mapping
  }

  const unplaced: string[] = []
  for (const issue of error.issues) {
    const field = asField(issue.path)
    if (field) mapping.fieldErrors.push({ field, message: issue.message })
    else unplaced.push(issue.message)
  }
  if (error.issues.length === 0) mapping.formError = error.message
  else if (unplaced.length > 0) mapping.formError = unplaced.join('. ')
  return mapping
}
