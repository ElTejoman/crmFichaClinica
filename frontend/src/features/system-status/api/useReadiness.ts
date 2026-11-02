import { useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/lib/http'
import type { components } from '@/shared/types/api'

export type Readiness = components['schemas']['ReadinessResponse']

/** Consulta periódica de `/ready` (tipos generados desde OpenAPI → contrato único). */
export function useReadiness() {
  return useQuery({
    queryKey: ['system', 'ready'],
    queryFn: ({ signal }) => apiGet<Readiness>('/ready', signal),
    refetchInterval: 30_000,
    retry: false,
  })
}
