import { z } from 'zod'

import { isDateKey, parseTimeOfDay } from '@/shared/lib/dates'
import type {
  AppointmentTypeCreate,
  ExceptionCreate,
  RoomCreate,
  Specialty,
  WorkingBlockCreate,
  WorkingBlockRead,
  WorkingBlockUpdate,
} from '@/shared/types/aliases'

const NAME_MAX = 80
const REASON_MAX = 200
const SLOT_MIN = 5
const SLOT_MAX = 240
const SLOT_STEP = 5
const LAST_WEEKDAY = 6

const specialtyEnum = z.enum([
  'ACUPUNCTURE',
  'NUTRITION',
  'CHIROPRACTIC',
  'IV_THERAPY',
  'DENTISTRY',
])

/** `HH:MM[:SS]` del API -> `HH:MM` para `<input type="time">`. */
export function trimSeconds(time: string): string {
  return time.slice(0, 5)
}

/* ---------- Horario semanal ---------- */

export interface ScheduleFormValues {
  weekday: string
  start_time: string
  end_time: string
  slot_minutes: string
  valid_from: string
  valid_to: string
}

export const EMPTY_SCHEDULE_VALUES: ScheduleFormValues = {
  weekday: '0',
  start_time: '09:00',
  end_time: '13:00',
  slot_minutes: '30',
  valid_from: '',
  valid_to: '',
}

export const scheduleFormSchema = z
  .object({
    weekday: z.string().regex(/^[0-6]$/, 'Elija el día de la semana'),
    start_time: z.string().refine((v) => parseTimeOfDay(v) !== null, 'Indique la hora de inicio'),
    end_time: z.string().refine((v) => parseTimeOfDay(v) !== null, 'Indique la hora de fin'),
    slot_minutes: z.string().refine((v) => {
      const n = Number(v)
      return Number.isInteger(n) && n >= SLOT_MIN && n <= SLOT_MAX && n % SLOT_STEP === 0
    }, `Minutos por cita: múltiplos de ${SLOT_STEP}, de ${SLOT_MIN} a ${SLOT_MAX}`),
    valid_from: z.string().refine((v) => v === '' || isDateKey(v), 'Fecha inválida'),
    valid_to: z.string().refine((v) => v === '' || isDateKey(v), 'Fecha inválida'),
  })
  .superRefine((values, ctx) => {
    const start = parseTimeOfDay(values.start_time)
    const end = parseTimeOfDay(values.end_time)
    if (start !== null && end !== null && end <= start) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_time'],
        message: 'La hora de fin debe ser posterior a la de inicio',
      })
    }
    if (values.valid_from && values.valid_to && values.valid_to < values.valid_from) {
      ctx.addIssue({
        code: 'custom',
        path: ['valid_to'],
        message: '«Vigente hasta» no puede ser anterior a «Vigente desde»',
      })
    }
  })

export function scheduleToFormValues(block: WorkingBlockRead): ScheduleFormValues {
  return {
    weekday: String(block.weekday),
    start_time: trimSeconds(block.start_time),
    end_time: trimSeconds(block.end_time),
    slot_minutes: String(block.slot_minutes),
    valid_from: block.valid_from ?? '',
    valid_to: block.valid_to ?? '',
  }
}

export function toWorkingBlockCreate(
  doctorId: string,
  values: ScheduleFormValues,
): WorkingBlockCreate {
  return {
    doctor_user_id: doctorId,
    weekday: Number(values.weekday),
    start_time: `${values.start_time}:00`,
    end_time: `${values.end_time}:00`,
    slot_minutes: Number(values.slot_minutes),
    valid_from: values.valid_from || null,
    valid_to: values.valid_to || null,
  }
}

export function toWorkingBlockUpdate(values: ScheduleFormValues): WorkingBlockUpdate {
  const { doctor_user_id: _doctor, ...rest } = toWorkingBlockCreate('', values)
  return rest
}

/* ---------- Excepciones ---------- */

export interface ExceptionFormValues {
  /** '' = toda la clínica (feriado). */
  doctor_user_id: string
  start_date: string
  end_date: string
  reason: string
}

export const EMPTY_EXCEPTION_VALUES: ExceptionFormValues = {
  doctor_user_id: '',
  start_date: '',
  end_date: '',
  reason: '',
}

export const exceptionFormSchema = z
  .object({
    doctor_user_id: z.string(),
    start_date: z.string().refine(isDateKey, 'Indique la fecha de inicio'),
    end_date: z.string().refine(isDateKey, 'Indique la fecha de fin'),
    reason: z
      .string()
      .trim()
      .min(1, 'Indique el motivo (p. ej. «Vacaciones» o «Feriado»)')
      .max(REASON_MAX, `Admite hasta ${REASON_MAX} caracteres`),
  })
  .superRefine((values, ctx) => {
    if (
      isDateKey(values.start_date) &&
      isDateKey(values.end_date) &&
      values.end_date < values.start_date
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'La fecha de fin no puede ser anterior a la de inicio',
      })
    }
  })

export function toExceptionCreate(values: ExceptionFormValues): ExceptionCreate {
  return {
    doctor_user_id: values.doctor_user_id || null,
    start_date: values.start_date,
    end_date: values.end_date,
    reason: values.reason.trim(),
  }
}

/* ---------- Salas ---------- */

export interface RoomFormValues {
  name: string
  specialties: Specialty[]
  is_active: boolean
}

export const EMPTY_ROOM_VALUES: RoomFormValues = { name: '', specialties: [], is_active: true }

export const roomFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ingrese el nombre de la sala')
    .max(NAME_MAX, `Admite hasta ${NAME_MAX} caracteres`),
  specialties: z.array(specialtyEnum),
  is_active: z.boolean(),
})

export function toRoomCreate(values: RoomFormValues): RoomCreate {
  return { name: values.name.trim(), specialties: values.specialties }
}

/* ---------- Tipos de cita ---------- */

export interface TypeFormValues {
  specialty: Specialty | ''
  name: string
  duration_minutes: string
  is_active: boolean
}

export const EMPTY_TYPE_VALUES: TypeFormValues = {
  specialty: '',
  name: '',
  duration_minutes: '30',
  is_active: true,
}

export const typeFormSchema = z.object({
  specialty: z
    .union([specialtyEnum, z.literal('')])
    .refine((v) => v !== '', 'Elija una especialidad'),
  name: z
    .string()
    .trim()
    .min(1, 'Ingrese el nombre del tipo de cita')
    .max(NAME_MAX, `Admite hasta ${NAME_MAX} caracteres`),
  duration_minutes: z.string().refine((v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= SLOT_MIN && n <= SLOT_MAX && n % SLOT_STEP === 0
  }, `Duración: múltiplos de ${SLOT_STEP}, de ${SLOT_MIN} a ${SLOT_MAX} minutos`),
  is_active: z.boolean(),
})

export function toTypeCreate(values: TypeFormValues): AppointmentTypeCreate {
  if (values.specialty === '') throw new Error('Especialidad requerida')
  return {
    specialty: values.specialty,
    name: values.name.trim(),
    duration_minutes: Number(values.duration_minutes),
  }
}

export const WEEKDAY_MAX = LAST_WEEKDAY
