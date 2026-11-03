import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet, apiPost } from '@/shared/lib/http'
import type { ConsentCreate, ConsentRead, ConsentTemplateRead } from '@/shared/types/aliases'

import { clinicalKeys } from './keys'

export function useConsentTemplates(enabled: boolean) {
  return useQuery({
    queryKey: clinicalKeys.templates,
    enabled,
    staleTime: Infinity,
    queryFn: ({ signal }) => apiGet<ConsentTemplateRead[]>('/consent-templates', { signal }),
  })
}

export function useConsents(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.consents(patientId),
    queryFn: ({ signal }) => apiGet<ConsentRead[]>(`/patients/${patientId}/consents`, { signal }),
  })
}

/** Capturar o revocar cambia el estado de consentimiento que muestra el resumen clínico. */
function useInvalidateConsents(patientId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: clinicalKeys.consents(patientId) }),
      queryClient.invalidateQueries({ queryKey: clinicalKeys.summary(patientId) }),
    ])
}

export function useCaptureConsent(patientId: string) {
  const invalidate = useInvalidateConsents(patientId)
  return useMutation({
    mutationFn: (body: ConsentCreate) =>
      apiPost<ConsentRead>(`/patients/${patientId}/consents`, body),
    onSuccess: invalidate,
  })
}

export function useRevokeConsent(patientId: string) {
  const invalidate = useInvalidateConsents(patientId)
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost<ConsentRead>(`/consents/${id}/revoke`, { reason }),
    onSuccess: invalidate,
  })
}

/** La imagen de la firma se pide a demanda y NO se guarda en caché (dato sensible, solo clínico). */
export function useSignatureImage() {
  return useMutation({
    mutationFn: (consentId: string) =>
      apiGet<{ image: string }>(`/consents/${consentId}/signature`),
  })
}
