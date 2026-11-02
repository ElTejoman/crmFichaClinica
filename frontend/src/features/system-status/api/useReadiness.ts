import { useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/lib/http'
import type { components } from '@/shared/types/api'

// `/ready` responde 503 con cuerpo JSON válido cuando una dependencia falla: es información, no error.
const READY_UNAVAILABLE = 503

export type Readiness = components['schemas']['ReadinessResponse']

/** Consulta periódica de `/ready` (tipos generados desde OpenAPI → contrato único). */
export function useReadiness() {
  return useQuery({
    queryKey: ['system', 'ready'],
    queryFn: ({ signal }) =>
      apiGet<Readiness>('/ready', { signal, acceptStatuses: [READY_UNAVAILABLE] }),
    refetchInterval: 30_000,
    retry: false,
  })
}
