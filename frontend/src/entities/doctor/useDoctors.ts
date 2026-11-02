import { useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/lib/http'
import type { DoctorSummary } from '@/shared/types/aliases'

const DOCTORS_STALE_MS = 5 * 60_000

/** Directorio de doctores (selectores de equipo tratante y responsable de leads). Cambia poco. */
export function useDoctors() {
  return useQuery({
    queryKey: ['doctors'],
    staleTime: DOCTORS_STALE_MS,
    queryFn: ({ signal }) => apiGet<DoctorSummary[]>('/doctors', { signal }),
  })
}
