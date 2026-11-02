import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/lib/http'
import type { PatientRead, PatientSummary } from '@/shared/types/aliases'

const LOOKUP_LIMIT = 8
const MIN_QUERY_LENGTH = 2

/** Búsqueda breve para selectores (agenda): con debounce desde quien la llama. */
export function usePatientLookup(q: string) {
  const enabled = q.trim().length >= MIN_QUERY_LENGTH
  return useQuery({
    queryKey: ['patients', 'lookup', q],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ q, limit: String(LOOKUP_LIMIT) })
      return apiGet<PatientSummary[]>(`/patients?${params.toString()}`, { signal })
    },
  })
}

/** Un paciente por id (pre-selección `?patient=`). Es una lectura individual: queda auditada. */
export function usePatientById(patientId: string | null) {
  return useQuery({
    queryKey: ['patients', 'detail', patientId],
    enabled: patientId !== null,
    queryFn: ({ signal }) => apiGet<PatientRead>(`/patients/${patientId ?? ''}`, { signal }),
  })
}
