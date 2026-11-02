import { z } from 'zod'

import { isValidPhone, PHONE_ERROR_MESSAGE } from '@/shared/lib/phone'
import type {
  LeadCreate,
  LeadRead,
  LeadSource,
  LeadUpdate,
  Specialty,
} from '@/shared/types/aliases'

const NAME_MAX = 150
const NOTES_MAX = 2000
const ACTIVITY_NOTES_MAX = 2000
export const LOST_REASON_MAX = 200

export interface LeadFormValues {
  full_name: string
  phone: string
  email: string
  interest_specialties: Specialty[]
  source: LeadSource
  consent_marketing: boolean
  /** UUID del responsable o '' (sin asignar). */
  assigned_to: string
  notes: string
}

export const EMPTY_LEAD_VALUES: LeadFormValues = {
  full_name: '',
  phone: '',
  email: '',
  interest_specialties: [],
  source: 'WALK_IN',
  consent_marketing: false,
  assigned_to: '',
  notes: '',
}

export const leadFormSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(1, 'Ingrese el nombre')
      .max(NAME_MAX, `Admite hasta ${NAME_MAX} caracteres`),
    phone: z.string().trim(),
    email: z.string().trim(),
    interest_specialties: z.array(
      z.enum(['ACUPUNCTURE', 'NUTRITION', 'CHIROPRACTIC', 'IV_THERAPY', 'DENTISTRY']),
    ),
    source: z.enum(['WEB', 'REFERRAL', 'INSTAGRAM', 'FACEBOOK', 'WALK_IN', 'OTHER']),
    consent_marketing: z.boolean(),
    assigned_to: z.string(),
    notes: z.string().trim().max(NOTES_MAX, `Admite hasta ${NOTES_MAX} caracteres`),
  })
  .superRefine((values, ctx) => {
    if (values.phone && !isValidPhone(values.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: PHONE_ERROR_MESSAGE })
    }
    if (values.email && !z.email().safeParse(values.email).success) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Ingrese un correo válido' })
    }
    if (!values.phone && !values.email) {
      // Sin canal de contacto el lead no se puede trabajar ni deduplicar.
      const message = 'Indique al menos un teléfono o un correo'
      ctx.addIssue({ code: 'custom', path: ['phone'], message })
      ctx.addIssue({ code: 'custom', path: ['email'], message })
    }
  })

const orNull = (value: string): string | null => value.trim() || null

export function toLeadCreate(values: LeadFormValues): LeadCreate {
  return {
    full_name: values.full_name,
    phone: orNull(values.phone),
    email: orNull(values.email),
    interest_specialties: values.interest_specialties,
    source: values.source,
    consent_marketing: values.consent_marketing,
    assigned_to: orNull(values.assigned_to),
    notes: orNull(values.notes),
  }
}

export function leadToFormValues(lead: LeadRead): LeadFormValues {
  return {
    full_name: lead.full_name,
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    interest_specialties: lead.interest_specialties,
    source: lead.source,
    consent_marketing: lead.consent_marketing,
    assigned_to: lead.assigned_to ?? '',
    notes: lead.notes ?? '',
  }
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join()

/** Solo los campos que cambiaron (el API aplica los enviados, incluso `null`). */
export function toLeadUpdate(initial: LeadFormValues, current: LeadFormValues): LeadUpdate {
  const next = toLeadCreate(current)
  const before = toLeadCreate(initial)
  const changes: LeadUpdate = {}
  if (next.full_name !== before.full_name) changes.full_name = next.full_name
  if (next.phone !== before.phone) changes.phone = next.phone
  if (next.email !== before.email) changes.email = next.email
  if (next.source !== before.source) changes.source = next.source
  if (next.consent_marketing !== before.consent_marketing) {
    changes.consent_marketing = next.consent_marketing
  }
  if (next.assigned_to !== before.assigned_to) changes.assigned_to = next.assigned_to
  if (next.notes !== before.notes) changes.notes = next.notes
  if (!sameSet(initial.interest_specialties, current.interest_specialties)) {
    changes.interest_specialties = current.interest_specialties
  }
  return changes
}

/* ---------- Registrar actividad ---------- */

export interface ActivityFormValues {
  type: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'NOTE'
  notes: string
  /** Valor de `<input type="datetime-local">`: hora local, sin zona. */
  next_action_at: string
}

export const EMPTY_ACTIVITY_VALUES: ActivityFormValues = {
  type: 'CALL',
  notes: '',
  next_action_at: '',
}

export const activityFormSchema = z.object({
  type: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'NOTE']),
  notes: z.string().trim().max(ACTIVITY_NOTES_MAX, `Admite hasta ${ACTIVITY_NOTES_MAX} caracteres`),
  next_action_at: z.string().refine((v) => v === '' || !Number.isNaN(new Date(v).getTime()), {
    message: 'Ingrese una fecha y hora válidas',
  }),
})
