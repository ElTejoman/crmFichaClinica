import { daysBetweenKeys, isDateKey, toIsoInstant } from '@/shared/lib/dates'
import type {
  AppointmentCreate,
  AppointmentTypeRead,
  RoomRead,
  SeriesCreate,
  Specialty,
} from '@/shared/types/aliases'

import type { ChosenSlot } from './availability'
import { isValidSeries, SERIES_DEFAULT_INTERVAL } from './series'

/** El API de disponibilidad rechaza rangos más largos. */
export const MAX_AVAILABILITY_DAYS = 14
export const ADMIN_NOTES_MAX = 500
export const MIN_DURATION = 5
export const MAX_DURATION = 240
const DURATION_STEP = 5
const DEFAULT_RANGE_DAYS = 6

/** Valor del selector de tipo para indicar duración manual. */
export const MANUAL_DURATION = '__manual__'

export interface BookingDraft {
  patientId: string
  specialty: Specialty | ''
  /** '' = cualquier doctor de la especialidad. */
  doctorId: string
  /** Id del tipo, MANUAL_DURATION, o '' (aún sin elegir). */
  typeId: string
  manualDuration: string
  fromDate: string
  toDate: string
  slot: ChosenSlot | null
  /** '' = sin sala. */
  roomId: string
  notes: string
  seriesEnabled: boolean
  seriesCount: string
  seriesInterval: string
}

export function emptyDraft(
  today: string,
  addDays: (key: string, n: number) => string,
): BookingDraft {
  return {
    patientId: '',
    specialty: '',
    doctorId: '',
    typeId: '',
    manualDuration: '',
    fromDate: today,
    toDate: addDays(today, DEFAULT_RANGE_DAYS),
    slot: null,
    roomId: '',
    notes: '',
    seriesEnabled: false,
    seriesCount: '4',
    seriesInterval: String(SERIES_DEFAULT_INTERVAL),
  }
}

/** Error del rango de fechas de la búsqueda de huecos, o null si es válido. */
export function rangeError(from: string, to: string): string | null {
  if (!isDateKey(from) || !isDateKey(to)) return 'Indique las fechas "desde" y "hasta".'
  const span = daysBetweenKeys(from, to)
  if (span < 0) return 'La fecha "hasta" no puede ser anterior a "desde".'
  if (span + 1 > MAX_AVAILABILITY_DAYS) {
    return `El rango admite como máximo ${MAX_AVAILABILITY_DAYS} días.`
  }
  return null
}

export function parseManualDuration(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null
  const minutes = Number(raw)
  const valid = minutes >= MIN_DURATION && minutes <= MAX_DURATION && minutes % DURATION_STEP === 0
  return valid ? minutes : null
}

export const DURATION_ERROR = `Indique minutos entre ${MIN_DURATION} y ${MAX_DURATION}, en múltiplos de ${DURATION_STEP}.`

/** Duración efectiva en minutos: la del tipo elegido o la manual. */
export function effectiveDuration(
  draft: Pick<BookingDraft, 'typeId' | 'manualDuration'>,
  types: readonly AppointmentTypeRead[],
): number | null {
  if (draft.typeId === MANUAL_DURATION) return parseManualDuration(draft.manualDuration)
  return types.find((t) => t.id === draft.typeId)?.duration_minutes ?? null
}

/** Parte "cuánto dura": tipo o duración manual (si hubiera ambos, el servidor prioriza la duración). */
function durationFields(
  draft: BookingDraft,
  types: readonly AppointmentTypeRead[],
): Pick<AppointmentCreate, 'duration_minutes' | 'appointment_type_id'> | null {
  if (draft.typeId === MANUAL_DURATION) {
    const minutes = parseManualDuration(draft.manualDuration)
    return minutes === null ? null : { duration_minutes: minutes, appointment_type_id: null }
  }
  const type = types.find((t) => t.id === draft.typeId)
  return type ? { duration_minutes: null, appointment_type_id: type.id } : null
}

/** Query string de `/appointments/availability`, o null si el borrador aún no alcanza para buscar. */
export function availabilityQuery(
  draft: BookingDraft,
  types: readonly AppointmentTypeRead[],
): string | null {
  if (!draft.specialty || rangeError(draft.fromDate, draft.toDate) !== null) return null
  const duration = durationFields(draft, types)
  if (!duration) return null
  const params = new URLSearchParams({ from_date: draft.fromDate, to_date: draft.toDate })
  if (draft.doctorId) params.set('doctor_id', draft.doctorId)
  else params.set('specialty', draft.specialty)
  if (duration.appointment_type_id) params.set('appointment_type_id', duration.appointment_type_id)
  if (duration.duration_minutes) params.set('duration_minutes', String(duration.duration_minutes))
  return params.toString()
}

function commonFields(draft: BookingDraft, types: readonly AppointmentTypeRead[]) {
  const duration = durationFields(draft, types)
  if (!draft.patientId || !draft.specialty || !draft.slot || !duration) return null
  return {
    patient_id: draft.patientId,
    doctor_user_id: draft.slot.doctorId,
    specialty: draft.specialty,
    // El servidor exige zona en los instantes: se normaliza a ISO UTC con Z.
    starts_at: toIsoInstant(draft.slot.startsAt),
    ...duration,
    room_id: draft.roomId || null,
    admin_notes: draft.notes.trim() || null,
  }
}

export function buildAppointmentPayload(
  draft: BookingDraft,
  types: readonly AppointmentTypeRead[],
): AppointmentCreate | null {
  return commonFields(draft, types)
}

export function buildSeriesPayload(
  draft: BookingDraft,
  types: readonly AppointmentTypeRead[],
): SeriesCreate | null {
  const common = commonFields(draft, types)
  const count = Number(draft.seriesCount)
  const interval = Number(draft.seriesInterval)
  if (!common || !isValidSeries(count, interval)) return null
  return { ...common, count, interval_days: interval }
}

/** Salas aptas: activas y que admiten la especialidad (lista vacía = cualquiera). */
export function roomsFor(rooms: readonly RoomRead[], specialty: Specialty | ''): RoomRead[] {
  return rooms.filter(
    (room) =>
      room.is_active &&
      (room.specialties.length === 0 || (specialty !== '' && room.specialties.includes(specialty))),
  )
}
