import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/lib/http'
import type { AuditLogRead, ChainVerification } from '@/shared/types/aliases'

export const AUDIT_PAGE_SIZE = 20

/** Igual que usuarios: se pide una fila de más para saber si hay página siguiente. */
export function useAuditLogs(page: number, action: string) {
  return useQuery({
    queryKey: ['audit-logs', page, action],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        limit: String(AUDIT_PAGE_SIZE + 1),
        offset: String(page * AUDIT_PAGE_SIZE),
      })
      if (action) params.set('action', action)
      return apiGet<AuditLogRead[]>(`/audit-logs?${params.toString()}`, { signal })
    },
    placeholderData: keepPreviousData,
    select: (rows) => ({
      events: rows.slice(0, AUDIT_PAGE_SIZE),
      hasNext: rows.length > AUDIT_PAGE_SIZE,
    }),
  })
}

/** Es una consulta bajo demanda (recorre toda la cadena): se modela como mutación, no como query. */
export function useVerifyAuditChain() {
  return useMutation({ mutationFn: () => apiGet<ChainVerification>('/audit-logs/verify') })
}
