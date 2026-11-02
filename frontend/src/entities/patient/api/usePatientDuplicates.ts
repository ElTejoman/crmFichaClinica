import { useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/lib/http'
import type { DuplicateCandidate } from '@/shared/types/aliases'

import type { DuplicateQuery } from '../duplicates'

const DUPLICATES_STALE_MS = 30_000

/** Candidatos a duplicado (el documento viene enmascarado). Se omite la consulta si `query` es null. */
export function usePatientDuplicates(query: DuplicateQuery | null) {
  return useQuery({
    queryKey: ['patient-duplicates', query],
    enabled: query !== null,
    staleTime: DUPLICATES_STALE_MS,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams()
      if (query) {
        params.set('first_name', query.first_name)
        params.set('last_name', query.last_name)
        if (query.birth_date) params.set('birth_date', query.birth_date)
        if (query.phone) params.set('phone', query.phone)
      }
      return apiGet<DuplicateCandidate[]>(`/patients/duplicates?${params.toString()}`, { signal })
    },
  })
}
