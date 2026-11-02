import type { ApiError } from '@/shared/lib/http'

export interface LeadDuplicateInfo {
  leads: { id: string; fullName: string; status: string }[]
  patients: { id: string; fullName: string }[]
}

const POSSIBLE_DUPLICATE = 'possible_duplicate'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Lee `details` del 409 de alta de lead. Devuelve `null` si el conflicto no es de duplicado. */
export function parseLeadDuplicate(error: ApiError): LeadDuplicateInfo | null {
  const details = error.details
  if (error.status !== 409 || details?.code !== POSSIBLE_DUPLICATE) return null
  const leads = Array.isArray(details.leads) ? details.leads : []
  const patients = Array.isArray(details.patients) ? details.patients : []
  return {
    leads: leads.filter(isRecord).flatMap((x) =>
      typeof x.id === 'string'
        ? [
            {
              id: x.id,
              fullName: typeof x.full_name === 'string' ? x.full_name : 'Lead',
              status: typeof x.status === 'string' ? x.status : '',
            },
          ]
        : [],
    ),
    patients: patients
      .filter(isRecord)
      .flatMap((x) =>
        typeof x.id === 'string'
          ? [{ id: x.id, fullName: typeof x.full_name === 'string' ? x.full_name : 'Paciente' }]
          : [],
      ),
  }
}
