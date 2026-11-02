import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { APPOINTMENTS_KEY } from '@/entities/appointment'
import { apiGet, apiPost } from '@/shared/lib/http'
import type {
  AppointmentCreate,
  AppointmentRead,
  AppointmentTypeRead,
  DoctorAvailability,
  RoomRead,
  SeriesCreate,
  SeriesResult,
  Specialty,
} from '@/shared/types/aliases'

import { AVAILABILITY_KEY, ROOMS_KEY, TYPES_KEY } from './keys'

/** Tipos de cita de una especialidad (solo activos para agendar). */
export function useAppointmentTypes(specialty: Specialty | '', enabled = true) {
  return useQuery({
    queryKey: [...TYPES_KEY, 'bookable', specialty],
    enabled: enabled && specialty !== '',
    queryFn: ({ signal }) =>
      apiGet<AppointmentTypeRead[]>(`/appointment-types?specialty=${specialty}`, { signal }),
  })
}

export function useRooms(enabled = true) {
  return useQuery({
    queryKey: [...ROOMS_KEY, 'active'],
    enabled,
    queryFn: ({ signal }) => apiGet<RoomRead[]>('/rooms', { signal }),
  })
}

/** Huecos libres. `query` ya viene armado y validado por `availabilityQuery`. */
export function useAvailability(query: string | null) {
  return useQuery({
    queryKey: [...AVAILABILITY_KEY, query],
    enabled: query !== null,
    queryFn: ({ signal }) =>
      apiGet<DoctorAvailability[]>(`/appointments/availability?${query ?? ''}`, { signal }),
  })
}

/** Tras agendar cambian las citas y los huecos libres: ambos se refrescan. */
function useInvalidateSchedulingData() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY }),
      queryClient.invalidateQueries({ queryKey: AVAILABILITY_KEY }),
    ])
}

export function useCreateAppointment() {
  const invalidate = useInvalidateSchedulingData()
  return useMutation({
    mutationFn: (payload: AppointmentCreate) => apiPost<AppointmentRead>('/appointments', payload),
    onSuccess: invalidate,
    // Un choque casi siempre es un hueco ya ocupado: se refrescan para que deje de ofrecerse.
    onError: invalidate,
  })
}

export function useCreateSeries() {
  const invalidate = useInvalidateSchedulingData()
  return useMutation({
    mutationFn: (payload: SeriesCreate) => apiPost<SeriesResult>('/appointments/series', payload),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export { useInvalidateSchedulingData }
