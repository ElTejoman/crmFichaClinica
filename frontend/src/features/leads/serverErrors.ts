import type { Path } from 'react-hook-form'

import type { ApiError } from '@/shared/lib/http'

import type { LeadFormValues } from './schemas'

type LeadField = Path<LeadFormValues>

const KNOWN_FIELDS: ReadonlySet<string> = new Set<LeadField>([
  'full_name',
  'phone',
  'email',
  'interest_specialties',
  'source',
  'consent_marketing',
  'assigned_to',
  'notes',
])

export interface LeadErrorMapping {
  fieldErrors: { field: LeadField; message: string }[]
  formError: string | null
}

/** Ubica los errores del servidor junto a su campo; lo que no encaje queda como mensaje general. */
export function mapLeadApiError(error: ApiError): LeadErrorMapping {
  if (error.code === 'invalid_assignee') {
    return { fieldErrors: [{ field: 'assigned_to', message: error.message }], formError: null }
  }
  const fieldErrors: LeadErrorMapping['fieldErrors'] = []
  const unplaced: string[] = []
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (KNOWN_FIELDS.has(key)) fieldErrors.push({ field: key as LeadField, message: issue.message })
    else unplaced.push(issue.message)
  }
  if (error.issues.length === 0) return { fieldErrors, formError: error.message }
  return { fieldErrors, formError: unplaced.length > 0 ? unplaced.join('. ') : null }
}
