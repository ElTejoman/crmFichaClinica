import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet, apiPatch, apiPost } from '@/shared/lib/http'
import type {
  AddendumCreate,
  EncounterCreate,
  EncounterRead,
  EncounterSummary,
  EncounterUpdate,
  IntegrityResult,
  SigningChecklist,
} from '@/shared/types/aliases'

import { clinicalKeys } from './keys'

export const ENCOUNTERS_PAGE_SIZE = 10

/** Línea de tiempo (más reciente primero). Se pide una fila de más solo para saber si hay otra página. */
export function useEncounterTimeline(patientId: string, page: number) {
  return useQuery({
    queryKey: [...clinicalKeys.encounters(patientId), { page }],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        limit: String(ENCOUNTERS_PAGE_SIZE + 1),
        offset: String(page * ENCOUNTERS_PAGE_SIZE),
      })
      return apiGet<EncounterSummary[]>(`/patients/${patientId}/encounters?${params.toString()}`, {
        signal,
      })
    },
    select: (rows) => ({
      encounters: rows.slice(0, ENCOUNTERS_PAGE_SIZE),
      hasNext: rows.length > ENCOUNTERS_PAGE_SIZE,
    }),
  })
}

/**
 * Un encuentro. Sin refetch automático: el editor mantiene su propio estado y recargar un
 * borrador a medio escribir lo pisaría.
 */
export function useEncounter(encounterId: string) {
  return useQuery({
    queryKey: clinicalKeys.encounter(encounterId),
    staleTime: Infinity,
    queryFn: ({ signal }) => apiGet<EncounterRead>(`/encounters/${encounterId}`, { signal }),
  })
}

export function useSigningChecklist(encounterId: string, enabled: boolean) {
  return useQuery({
    queryKey: clinicalKeys.checklist(encounterId),
    enabled,
    // Se vuelve a pedir tras cada guardado (lo invalida `useUpdateEncounter`), no por tiempo.
    staleTime: Infinity,
    queryFn: ({ signal }) =>
      apiGet<SigningChecklist>(`/encounters/${encounterId}/signing-checklist`, { signal }),
  })
}

export function useCreateEncounter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: EncounterCreate) => apiPost<EncounterRead>('/encounters', body),
    onSuccess: (encounter) => {
      queryClient.setQueryData(clinicalKeys.encounter(encounter.id), encounter)
      return queryClient.invalidateQueries({
        queryKey: clinicalKeys.encounters(encounter.patient_id),
      })
    },
  })
}

/** PATCH parcial del borrador. Guarda la respuesta (trae el IMC calculado) y refresca el checklist. */
export function useUpdateEncounter(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: EncounterUpdate) =>
      apiPatch<EncounterRead>(`/encounters/${encounterId}`, changes),
    onSuccess: (encounter) => {
      queryClient.setQueryData(clinicalKeys.encounter(encounterId), encounter)
      return queryClient.invalidateQueries({ queryKey: clinicalKeys.checklist(encounterId) })
    },
  })
}

/** Tras firmar o enmendar cambian la línea de tiempo y el resumen (contadores, último encuentro). */
function useAfterStatusChange(encounterId: string) {
  const queryClient = useQueryClient()
  return (encounter: EncounterRead) => {
    queryClient.setQueryData(clinicalKeys.encounter(encounterId), encounter)
    queryClient.removeQueries({ queryKey: clinicalKeys.checklist(encounterId) })
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: clinicalKeys.encounters(encounter.patient_id) }),
      queryClient.invalidateQueries({ queryKey: clinicalKeys.summary(encounter.patient_id) }),
    ])
  }
}

export function useSignEncounter(encounterId: string) {
  const after = useAfterStatusChange(encounterId)
  return useMutation({
    mutationFn: () => apiPost<EncounterRead>(`/encounters/${encounterId}/sign`),
    onSuccess: after,
  })
}

export function useAddAddendum(encounterId: string) {
  const after = useAfterStatusChange(encounterId)
  return useMutation({
    mutationFn: (body: AddendumCreate) =>
      apiPost<EncounterRead>(`/encounters/${encounterId}/addenda`, body),
    onSuccess: after,
  })
}

/** La verificación recalcula el SHA-256 en el servidor: se pide a demanda, nunca en caché. */
export function useVerifyIntegrity(encounterId: string) {
  return useMutation({
    mutationFn: () => apiGet<IntegrityResult>(`/encounters/${encounterId}/integrity`),
  })
}
