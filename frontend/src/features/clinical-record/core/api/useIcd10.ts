import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/lib/http'
import type { Icd10Read } from '@/shared/types/aliases'

import { clinicalKeys } from './keys'

export const ICD10_MIN_QUERY_LENGTH = 2
export const ICD10_RESULT_LIMIT = 15

/** Búsqueda en el catálogo CIE-10 (código o texto). El debounce lo aplica quien la llama. */
export function useIcd10Search(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: clinicalKeys.icd10(trimmed),
    enabled: trimmed.length >= ICD10_MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    // El catálogo no cambia durante la sesión.
    staleTime: Infinity,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ q: trimmed, limit: String(ICD10_RESULT_LIMIT) })
      return apiGet<Icd10Read[]>(`/icd10?${params.toString()}`, { signal })
    },
  })
}
