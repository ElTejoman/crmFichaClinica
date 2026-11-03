import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiDownload, apiGet, apiUpload } from '@/shared/lib/http'
import type { AttachmentKind, AttachmentRead } from '@/shared/types/aliases'

import { clinicalKeys } from './keys'

export function useAttachments(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.attachments(patientId),
    queryFn: ({ signal }) =>
      apiGet<AttachmentRead[]>(`/patients/${patientId}/attachments`, { signal }),
  })
}

export interface UploadRequest {
  file: File
  kind: AttachmentKind
  hasPatientConsent: boolean
  encounterId?: string
}

export function useUploadAttachment(patientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, kind, hasPatientConsent, encounterId }: UploadRequest) => {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', kind)
      form.append('has_patient_consent', String(hasPatientConsent))
      if (encounterId) form.append('encounter_id', encounterId)
      return apiUpload<AttachmentRead>(`/patients/${patientId}/attachments`, form)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: clinicalKeys.attachments(patientId) }),
  })
}

/** Descarga autenticada: devuelve los bytes; guardar el archivo es cosa de `saveBlobAs`. */
export function useDownloadAttachment() {
  return useMutation({
    mutationFn: (attachmentId: string) => apiDownload(`/attachments/${attachmentId}/download`),
  })
}
