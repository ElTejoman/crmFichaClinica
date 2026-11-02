import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/lib/http'
import type {
  AppointmentTypeCreate,
  AppointmentTypeRead,
  AppointmentTypeUpdate,
  ExceptionCreate,
  ExceptionCreated,
  ExceptionRead,
  RoomCreate,
  RoomRead,
  RoomUpdate,
  Specialty,
  WorkingBlockCreate,
  WorkingBlockRead,
  WorkingBlockUpdate,
} from '@/shared/types/aliases'

import { AVAILABILITY_KEY, EXCEPTIONS_KEY, ROOMS_KEY, SCHEDULES_KEY, TYPES_KEY } from './keys'

/* Cambiar horarios, excepciones, salas o tipos altera qué huecos se ofrecen. */
function useInvalidateAvailabilityAnd(...keys: (readonly string[])[]) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [AVAILABILITY_KEY, ...keys].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
}

/* ---------- Horarios ---------- */

export function useSchedules(doctorId: string) {
  return useQuery({
    queryKey: [...SCHEDULES_KEY, doctorId],
    enabled: doctorId !== '',
    queryFn: ({ signal }) =>
      apiGet<WorkingBlockRead[]>(`/schedules?doctor_id=${doctorId}&include_inactive=true`, {
        signal,
      }),
  })
}

export function useCreateSchedule() {
  const invalidate = useInvalidateAvailabilityAnd(SCHEDULES_KEY)
  return useMutation({
    mutationFn: (payload: WorkingBlockCreate) => apiPost<WorkingBlockRead>('/schedules', payload),
    onSuccess: invalidate,
  })
}

export function useUpdateSchedule() {
  const invalidate = useInvalidateAvailabilityAnd(SCHEDULES_KEY)
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: WorkingBlockUpdate }) =>
      apiPatch<WorkingBlockRead>(`/schedules/${id}`, changes),
    onSuccess: invalidate,
  })
}

/* ---------- Excepciones ---------- */

export function useExceptions(fromDate: string) {
  return useQuery({
    queryKey: [...EXCEPTIONS_KEY, fromDate],
    queryFn: ({ signal }) =>
      apiGet<ExceptionRead[]>(`/schedule-exceptions?from_date=${fromDate}`, { signal }),
  })
}

export function useCreateException() {
  const invalidate = useInvalidateAvailabilityAnd(EXCEPTIONS_KEY)
  return useMutation({
    mutationFn: (payload: ExceptionCreate) =>
      apiPost<ExceptionCreated>('/schedule-exceptions', payload),
    onSuccess: invalidate,
  })
}

export function useDeleteException() {
  const invalidate = useInvalidateAvailabilityAnd(EXCEPTIONS_KEY)
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/schedule-exceptions/${id}`),
    onSuccess: invalidate,
  })
}

/* ---------- Salas ---------- */

export function useAllRooms() {
  return useQuery({
    queryKey: [...ROOMS_KEY, 'all'],
    queryFn: ({ signal }) => apiGet<RoomRead[]>('/rooms?include_inactive=true', { signal }),
  })
}

export function useCreateRoom() {
  const invalidate = useInvalidateAvailabilityAnd(ROOMS_KEY)
  return useMutation({
    mutationFn: (payload: RoomCreate) => apiPost<RoomRead>('/rooms', payload),
    onSuccess: invalidate,
  })
}

export function useUpdateRoom() {
  const invalidate = useInvalidateAvailabilityAnd(ROOMS_KEY)
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: RoomUpdate }) =>
      apiPatch<RoomRead>(`/rooms/${id}`, changes),
    onSuccess: invalidate,
  })
}

/* ---------- Tipos de cita ---------- */

export function useAllAppointmentTypes(specialty: Specialty | '') {
  return useQuery({
    queryKey: [...TYPES_KEY, 'all', specialty],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ include_inactive: 'true' })
      if (specialty) params.set('specialty', specialty)
      return apiGet<AppointmentTypeRead[]>(`/appointment-types?${params.toString()}`, { signal })
    },
  })
}

export function useCreateAppointmentType() {
  const invalidate = useInvalidateAvailabilityAnd(TYPES_KEY)
  return useMutation({
    mutationFn: (payload: AppointmentTypeCreate) =>
      apiPost<AppointmentTypeRead>('/appointment-types', payload),
    onSuccess: invalidate,
  })
}

export function useUpdateAppointmentType() {
  const invalidate = useInvalidateAvailabilityAnd(TYPES_KEY)
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: AppointmentTypeUpdate }) =>
      apiPatch<AppointmentTypeRead>(`/appointment-types/${id}`, changes),
    onSuccess: invalidate,
  })
}
