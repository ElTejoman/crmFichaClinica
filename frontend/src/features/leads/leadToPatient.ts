import { EMPTY_PATIENT_VALUES, splitFullName, type PatientFormValues } from '@/entities/patient'
import type { LeadRead } from '@/shared/types/aliases'

/**
 * Valores iniciales del paciente a partir del lead. Nombre, teléfono, correo y fuente se
 * trasladan; documento, fecha de nacimiento, sexo y consentimiento los completa el usuario
 * (el lead no los tiene y el consentimiento debe darlo el propio paciente).
 */
export function leadToPatientDefaults(lead: LeadRead): PatientFormValues {
  const { firstName, lastName } = splitFullName(lead.full_name)
  return {
    ...EMPTY_PATIENT_VALUES,
    first_name: firstName,
    last_name: lastName,
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    referral_source: lead.source,
  }
}
