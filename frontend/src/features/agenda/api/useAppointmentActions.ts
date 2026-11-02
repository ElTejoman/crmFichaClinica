import { useMutation, useQuery } from '@tanstack/react-query'

import { APPOINTMENTS_KEY } from '@/entities/appointment'
import { apiGet, apiPost } from '@/shared/lib/http'
import type { AppointmentRead, RescheduleBody } from '@/shared/types/aliases'

import type { AppointmentAction } from '../actions'
import { useInvalidateSchedulingData } from './useBooking'

export interface ActionRequest {
  id: string
  action: AppointmentAction
  /** Solo `cancel` ({reason}) y `reschedule` llevan cuerpo. */
  body?: { reason: string } | RescheduleBody
}

/** Una mutación para todas las transiciones: `POST /appointments/{id}/{action}`. */
export function useAppointmentAction() {
  const invalidate = useInvalidateSchedulingData()
  return useMutation({
    mutationFn: ({ id, action, body }: ActionRequest) =>
      apiPost<AppointmentRead>(`/appointments/${id}/${action}`, body),
    onSuccess: invalidate,
  })
}

/** Sesiones de un paquete (`series_id`). */
export function useSeriesAppointments(seriesId: string | null) {
  return useQuery({
    queryKey: [...APPOINTMENTS_KEY, 'series', seriesId],
    enabled: seriesId !== null,
    queryFn: ({ signal }) =>
      apiGet<AppointmentRead[]>(`/appointments/series/${seriesId ?? ''}`, { signal }),
  })
}
