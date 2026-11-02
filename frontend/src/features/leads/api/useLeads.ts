import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet, apiPatch, apiPost } from '@/shared/lib/http'
import type {
  LeadActivityCreate,
  LeadConversionResult,
  LeadCreate,
  LeadRead,
  LeadStats,
  LeadStatus,
  LeadSummary,
  LeadUpdate,
  PatientCreate,
} from '@/shared/types/aliases'

import { OPEN_STATUSES, type OpenStatus } from '../kanbanRules'

/** Máximo que admite el API por página; una columna con más leads avisa de que está truncada. */
export const LEADS_COLUMN_LIMIT = 200
const LEADS_KEY = ['leads'] as const
const BOARD_KEY = [...LEADS_KEY, 'board'] as const

export interface LeadFilters {
  q: string
  source: string
  specialty: string
  assignedTo: string
}

export const EMPTY_FILTERS: LeadFilters = { q: '', source: '', specialty: '', assignedTo: '' }

function listPath(status: LeadStatus, filters: LeadFilters): string {
  const params = new URLSearchParams({ status, limit: String(LEADS_COLUMN_LIMIT) })
  if (filters.q) params.set('q', filters.q)
  if (filters.source) params.set('source', filters.source)
  if (filters.specialty) params.set('specialty', filters.specialty)
  if (filters.assignedTo) params.set('assigned_to', filters.assignedTo)
  return `/leads?${params.toString()}`
}

/** Una consulta por columna abierta: así ninguna se trunca por el límite de la página única. */
export function useBoardLeads(filters: LeadFilters) {
  return useQueries({
    queries: OPEN_STATUSES.map((status) => ({
      queryKey: [...BOARD_KEY, filters, status],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiGet<LeadSummary[]>(listPath(status, filters), { signal }),
    })),
    combine: (results) => {
      const byStatus = Object.fromEntries(
        OPEN_STATUSES.map((status, index) => [status, results[index]?.data ?? []]),
      ) as Record<OpenStatus, LeadSummary[]>
      return {
        byStatus,
        isPending: results.some((r) => r.isPending),
        error: results.find((r) => r.isError)?.error ?? null,
      }
    },
  })
}

/** Perdidos / Convertidos: solo se consultan al abrir su pestaña. */
export function useClosedLeads(
  status: 'LOST' | 'CONVERTED',
  filters: LeadFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...LEADS_KEY, 'closed', status, filters],
    enabled,
    queryFn: ({ signal }) => apiGet<LeadSummary[]>(listPath(status, filters), { signal }),
  })
}

export function useLead(leadId: string) {
  return useQuery({
    queryKey: [...LEADS_KEY, 'detail', leadId],
    queryFn: ({ signal }) => apiGet<LeadRead>(`/leads/${leadId}`, { signal }),
  })
}

export function useFollowups() {
  return useQuery({
    queryKey: [...LEADS_KEY, 'followups'],
    queryFn: ({ signal }) => apiGet<LeadSummary[]>('/leads/followups', { signal }),
  })
}

export function useLeadStats() {
  return useQuery({
    queryKey: [...LEADS_KEY, 'stats'],
    queryFn: ({ signal }) => apiGet<LeadStats>('/leads/stats', { signal }),
  })
}

export function useCreateLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, allowDuplicate }: { payload: LeadCreate; allowDuplicate: boolean }) =>
      apiPost<LeadRead>(`/leads${allowDuplicate ? '?allow_duplicate=true' : ''}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LEADS_KEY }),
  })
}

export function useUpdateLead(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: LeadUpdate) => apiPatch<LeadRead>(`/leads/${leadId}`, changes),
    onSuccess: (lead) => {
      queryClient.setQueryData([...LEADS_KEY, 'detail', leadId], lead)
      return queryClient.invalidateQueries({ queryKey: LEADS_KEY })
    },
  })
}

export function useAddActivity(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: LeadActivityCreate) =>
      apiPost<LeadRead>(`/leads/${leadId}/activities`, payload),
    onSuccess: (lead) => {
      queryClient.setQueryData([...LEADS_KEY, 'detail', leadId], lead)
      return queryClient.invalidateQueries({ queryKey: LEADS_KEY })
    },
  })
}

export function useConvertLead(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patient: PatientCreate) =>
      apiPost<LeadConversionResult>(`/leads/${leadId}/convert`, { patient }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: LEADS_KEY }),
        queryClient.invalidateQueries({ queryKey: ['patients'] }),
      ]),
  })
}

interface MoveVariables {
  lead: LeadSummary
  to: LeadStatus
  lostReason?: string
}

type BoardSnapshot = [readonly unknown[], LeadSummary[] | undefined][]

/**
 * Mover un lead de etapa (PATCH `{status, lost_reason?}`). La tarjeta se mueve al instante
 * (actualización optimista) y, si el servidor rechaza el cambio, vuelve a su sitio y se informa.
 */
export function useMoveLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ lead, to, lostReason }: MoveVariables) =>
      apiPatch<LeadRead>(`/leads/${lead.id}`, {
        status: to,
        ...(lostReason ? { lost_reason: lostReason } : {}),
      }),
    onMutate: async ({ lead, to }): Promise<BoardSnapshot> => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY })
      const snapshot: BoardSnapshot = queryClient.getQueriesData<LeadSummary[]>({
        queryKey: BOARD_KEY,
      })
      for (const [key, rows] of snapshot) {
        if (!rows) continue
        const columnStatus = key[key.length - 1]
        if (columnStatus === lead.status) {
          queryClient.setQueryData(
            key,
            rows.filter((row) => row.id !== lead.id),
          )
        } else if (columnStatus === to) {
          queryClient.setQueryData(key, [{ ...lead, status: to }, ...rows])
        }
      }
      return snapshot
    },
    onError: (_error, _variables, snapshot) => {
      for (const [key, rows] of snapshot ?? []) queryClient.setQueryData(key, rows)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: LEADS_KEY }),
  })
}
