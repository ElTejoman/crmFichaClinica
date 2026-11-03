import { z } from 'zod'

import type { AttachmentKind } from '@/shared/types/aliases'

/** Espeja `MAX_ATTACHMENT_BYTES` y `ALLOWED_MIME_TYPES` del servidor (que vuelve a validar los bytes). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const BYTES_PER_MB = 1024 * 1024

export const ALLOWED_ATTACHMENT_TYPES: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]

/** Valor del atributo `accept` del selector de archivos. */
export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_TYPES.join(',')

const attachmentKindSchema = z.enum(['LAB', 'IMAGING', 'PHOTO', 'REPORT', 'CONSENT_SCAN', 'OTHER'])

function formatMegabytes(bytes: number): string {
  return (bytes / BYTES_PER_MB).toFixed(1).replace('.', ',')
}

/** Validación previa a la subida: ahorra enviar 10 MB para recibir un rechazo. */
export const attachmentUploadSchema = z
  .object({
    file: z.instanceof(File, { message: 'Elija un archivo' }),
    kind: attachmentKindSchema,
    hasPatientConsent: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const { file, kind, hasPatientConsent } = values
    if (file.size === 0) {
      ctx.addIssue({ code: 'custom', path: ['file'], message: 'El archivo está vacío' })
    } else if (file.size > MAX_ATTACHMENT_BYTES) {
      ctx.addIssue({
        code: 'custom',
        path: ['file'],
        message: `El archivo pesa ${formatMegabytes(file.size)} MB; el máximo es ${formatMegabytes(MAX_ATTACHMENT_BYTES)} MB`,
      })
    }
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      ctx.addIssue({
        code: 'custom',
        path: ['file'],
        message: 'Solo se admiten archivos PDF, PNG, JPEG o WEBP',
      })
    }
    if (kind === 'PHOTO' && !hasPatientConsent) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasPatientConsent'],
        message: 'Las fotografías exigen que el paciente haya dado su consentimiento',
      })
    }
  })

export type AttachmentUploadInput = {
  file: File
  kind: AttachmentKind
  hasPatientConsent: boolean
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < BYTES_PER_MB) return `${(bytes / 1024).toFixed(0)} KB`
  return `${formatMegabytes(bytes)} MB`
}
