import { useQuery } from '@tanstack/react-query'

import { limaDayRangeUtc, todayLimaKey } from '@/shared/lib/dates'
import { apiGet } from '@/shared/lib/http'
import type { AppointmentRead, AppointmentStatus, Specialty } from '@/shared/types/aliases'

/** Raíz de las consultas de citas: las mutaciones invalidan todo lo que cuelga de aquí. */
export const APPOINTMENTS_KEY = ['appointments'] as const

/** Máximo del API por página. */
export const APPOINTMENTS_MAX_LIMIT = 500

export interface AppointmentFilters {
  /** Instantes ISO con zona: una cita entra si se solapa con [from, to). */
  from?: string
  to?: string
  doctorId?: string
  specialty?: Specialty | ''
  status?: AppointmentStatus
  patientId?: string
  roomId?: string
  limit?: number
}

/** Arma `/appointments?...` omitiendo los filtros vacíos. */
export function appointmentsPath(filters: AppointmentFilters): string {
  const params = new URLSearchParams()
  const entries: [string, string | number | undefined][] = [
    ['from', filters.from],
    ['to', filters.to],
    ['doctor_id', filters.doctorId],
    ['specialty', filters.specialty],
    ['status', filters.status],
    ['patient_id', filters.patientId],
    ['room_id', filters.roomId],
    ['limit', filters.limit ?? APPOINTMENTS_MAX_LIMIT],
  ]
  for (const [key, value] of entries) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return `/appointments?${params.toString()}`
}

export interface AppointmentQueryOptions {
  enabled?: boolean
  /** Refresco periódico (cola del doctor): el estado cambia desde recepción. */
  refetchIntervalMs?: number
}

export function useAppointments(
  filters: AppointmentFilters,
  options: AppointmentQueryOptions = {},
) {
  return useQuery({
    queryKey: [...APPOINTMENTS_KEY, 'list', filters],
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchIntervalMs ?? false,
    queryFn: ({ signal }) => apiGet<AppointmentRead[]>(appointmentsPath(filters), { signal }),
  })
}

/** Citas del día de Lima `dayKey` (todos los doctores que el servidor permita ver). */
export function useDayAppointments(
  dayKey: string,
  extra: AppointmentFilters = {},
  options: AppointmentQueryOptions = {},
) {
  const { from, to } = limaDayRangeUtc(dayKey)
  return useAppointments({ ...extra, from, to }, options)
}

/**
 * Citas del paciente desde el inicio de HOY (Lima). Se ancla al inicio del día —y no a "ahora"—
 * para que la clave de caché sea estable; las ya terminadas se descartan al mostrar.
 */
export function usePatientAppointments(patientId: string) {
  const { from } = limaDayRangeUtc(todayLimaKey())
  return useAppointments({ patientId, from })
}
