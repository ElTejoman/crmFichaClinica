import { z } from 'zod'

import { addPasswordIssues } from '@/shared/lib/passwordPolicy'
import type { UserCreate, UserUpdate } from '@/shared/types/aliases'

const NAME_MIN = 2
const NAME_MAX = 200
const PHONE_MAX = 30
const LICENSE_MAX = 40

const roleSchema = z.enum(['SUPERUSER', 'OWNER', 'DOCTOR', 'RECEPTION', 'PATIENT'])
const specialtySchema = z.enum([
  'ACUPUNCTURE',
  'NUTRITION',
  'CHIROPRACTIC',
  'IV_THERAPY',
  'DENTISTRY',
])
const bodySchema = z.enum(['CMP', 'COP', 'CNP', 'OTHER'])

const fullNameSchema = z
  .string()
  .trim()
  .min(NAME_MIN, `El nombre debe tener al menos ${NAME_MIN} caracteres`)
  .max(NAME_MAX, `El nombre admite hasta ${NAME_MAX} caracteres`)
const phoneSchema = z
  .string()
  .trim()
  .max(PHONE_MAX, `El teléfono admite hasta ${PHONE_MAX} caracteres`)
const rolesSchema = z.array(roleSchema).min(1, 'Seleccione al menos un rol')

export const createUserSchema = z
  .object({
    email: z.string().trim().min(1, 'Ingrese el correo').pipe(z.email('Ingrese un correo válido')),
    full_name: fullNameSchema,
    phone: phoneSchema,
    password: z.string(),
    roles: rolesSchema,
    // Siempre presente en el formulario; solo se valida/envía si el rol DOCTOR está marcado.
    doctor: z.object({
      license_number: z.string().trim().max(LICENSE_MAX, `Admite hasta ${LICENSE_MAX} caracteres`),
      professional_body: z.union([bodySchema, z.literal('')]),
      rne: z.string().trim().max(LICENSE_MAX, `Admite hasta ${LICENSE_MAX} caracteres`),
      specialties: z.array(specialtySchema),
    }),
  })
  .superRefine((values, ctx) => {
    addPasswordIssues(values.password, values.email, ctx)
    if (!values.roles.includes('DOCTOR')) return
    const { doctor } = values
    if (!doctor.license_number) {
      ctx.addIssue({
        code: 'custom',
        path: ['doctor', 'license_number'],
        message: 'Ingrese el N.º de colegiatura',
      })
    }
    if (!doctor.professional_body) {
      ctx.addIssue({
        code: 'custom',
        path: ['doctor', 'professional_body'],
        message: 'Seleccione el colegio profesional',
      })
    }
    if (doctor.specialties.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['doctor', 'specialties'],
        message: 'Seleccione al menos una especialidad',
      })
    }
  })

export type CreateUserValues = z.infer<typeof createUserSchema>

export const EMPTY_CREATE_VALUES: CreateUserValues = {
  email: '',
  full_name: '',
  phone: '',
  password: '',
  roles: [],
  doctor: { license_number: '', professional_body: '', rne: '', specialties: [] },
}

/** Traduce el formulario al contrato del API; el bloque de doctor solo viaja si el rol está marcado. */
export function toUserCreate(values: CreateUserValues): UserCreate {
  const isDoctor = values.roles.includes('DOCTOR')
  return {
    email: values.email,
    full_name: values.full_name,
    phone: values.phone || null,
    password: values.password,
    roles: values.roles,
    doctor_profile:
      isDoctor && values.doctor.professional_body
        ? {
            license_number: values.doctor.license_number,
            professional_body: values.doctor.professional_body,
            rne: values.doctor.rne || null,
            specialties: values.doctor.specialties,
          }
        : null,
  }
}

export const editUserSchema = z.object({
  full_name: fullNameSchema,
  phone: phoneSchema,
  roles: rolesSchema,
})

export type EditUserValues = z.infer<typeof editUserSchema>

/** El API trata `phone: null` como "sin cambio" (no permite vaciarlo), por eso se omite si está vacío. */
export function toUserUpdate(values: EditUserValues): UserUpdate {
  return {
    full_name: values.full_name,
    roles: values.roles,
    ...(values.phone ? { phone: values.phone } : {}),
  }
}
