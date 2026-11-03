import { useState, type ChangeEvent } from 'react'

import { formatShortDateTimeLima } from '@/shared/lib/dates'
import type { AttachmentKind, AttachmentRead } from '@/shared/types/aliases'
import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  Field,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from '@/shared/ui'

import { useAttachments, useDownloadAttachment, useUploadAttachment } from '../api/useAttachments'
import {
  ATTACHMENT_ACCEPT,
  attachmentUploadSchema,
  formatFileSize,
  MAX_ATTACHMENT_BYTES,
} from '../attachments'
import { ALL_ATTACHMENT_KINDS, ATTACHMENT_KIND_LABELS } from '../labels'
import { saveBlobAs } from '../saveBlob'
import { ClinicalError } from './ClinicalError'

type UploadErrors = { file?: string; hasPatientConsent?: string }

function UploadForm({ patientId }: { patientId: string }) {
  const upload = useUploadAttachment(patientId)
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<AttachmentKind>('REPORT')
  const [hasConsent, setHasConsent] = useState(false)
  const [errors, setErrors] = useState<UploadErrors>({})
  const [inputKey, setInputKey] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setErrors({})
    setMessage(null)
  }

  async function submit() {
    setMessage(null)
    const parsed = attachmentUploadSchema.safeParse({ file, kind, hasPatientConsent: hasConsent })
    if (!parsed.success) {
      const next: UploadErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key === 'file' && next.file === undefined) next.file = issue.message
        if (key === 'hasPatientConsent' && next.hasPatientConsent === undefined) {
          next.hasPatientConsent = issue.message
        }
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await upload.mutateAsync({
        file: parsed.data.file,
        kind: parsed.data.kind,
        hasPatientConsent: parsed.data.hasPatientConsent,
      })
      setMessage('Archivo subido.')
      setFile(null)
      setHasConsent(false)
      setInputKey((k) => k + 1)
    } catch {
      // El rechazo del servidor (tipo/contenido no válido) se muestra desde `upload.error`.
    }
  }

  return (
    <form
      noValidate
      aria-label="Subir adjunto"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-5"
    >
      <h4 className="text-base font-semibold text-slate-900">Subir archivo</h4>
      {upload.isError && <ClinicalError error={upload.error} />}
      <div aria-live="polite" className="empty:hidden">
        {message && <Alert tone="success">{message}</Alert>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Archivo"
          required
          hint={`PDF, PNG, JPEG o WEBP. Máximo ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`}
          error={errors.file}
        >
          {(c) => (
            <input
              {...c}
              key={inputKey}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              onChange={onFile}
              className="block w-full text-sm text-slate-900 file:mr-3 file:min-h-10 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:text-sm"
            />
          )}
        </Field>
        <Field label="Tipo" required>
          {(c) => (
            <Select
              {...c}
              value={kind}
              onChange={(event) => {
                const chosen = ALL_ATTACHMENT_KINDS.find((k) => k === event.target.value)
                if (chosen) setKind(chosen)
                setErrors({})
              }}
            >
              {ALL_ATTACHMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ATTACHMENT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <CheckboxField
        label={
          kind === 'PHOTO'
            ? 'El paciente dio su consentimiento para esta fotografía'
            : 'El paciente dio su consentimiento para conservar este archivo'
        }
        hint={kind === 'PHOTO' ? 'Obligatorio para fotografías.' : undefined}
        error={errors.hasPatientConsent}
        checked={hasConsent}
        onChange={(event) => {
          setHasConsent(event.target.checked)
          setErrors({})
        }}
      />
      <div className="flex justify-end">
        <Button type="submit" loading={upload.isPending}>
          Subir archivo
        </Button>
      </div>
    </form>
  )
}

function AttachmentRow({ attachment }: { attachment: AttachmentRead }) {
  const download = useDownloadAttachment()

  function onDownload() {
    download.mutate(attachment.id, {
      onSuccess: (blob) => saveBlobAs(blob, attachment.original_name),
    })
  }

  return (
    <tr>
      <Td>
        {/* Solo texto: el nombre del archivo es dato del usuario y nunca se interpreta como HTML. */}
        <span className="break-all font-medium text-slate-900">{attachment.original_name}</span>
        {download.isError && (
          <div className="mt-1">
            <ClinicalError error={download.error} />
          </div>
        )}
      </Td>
      <Td>{ATTACHMENT_KIND_LABELS[attachment.kind]}</Td>
      <Td>{formatFileSize(attachment.size_bytes)}</Td>
      <Td>{formatShortDateTimeLima(attachment.created_at)}</Td>
      <Td>
        {attachment.has_patient_consent ? (
          <Badge tone="success" icon="✓">
            Con consentimiento
          </Badge>
        ) : (
          <Badge tone="neutral">Sin consentimiento</Badge>
        )}
      </Td>
      <Td>
        <Button
          variant="secondary"
          className="min-h-8 px-2.5 py-1 text-xs"
          loading={download.isPending}
          aria-label={`Descargar: ${attachment.original_name}`}
          onClick={onDownload}
        >
          Descargar
        </Button>
      </Td>
    </tr>
  )
}

/**
 * Adjuntos del paciente. Solo se DESCARGAN (con Bearer, vía Blob); jamás se renderiza su
 * contenido en la página, porque un PDF o imagen subido es contenido no confiable.
 */
export function AttachmentsPanel({
  patientId,
  canUpload,
}: {
  patientId: string
  canUpload: boolean
}) {
  const attachments = useAttachments(patientId)
  return (
    <section aria-labelledby="attachments-title" className="flex flex-col gap-4">
      <h3 id="attachments-title" className="text-lg font-semibold text-slate-900">
        Adjuntos
      </h3>
      {canUpload && <UploadForm patientId={patientId} />}
      {attachments.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando adjuntos…
        </p>
      )}
      {attachments.isError && <ClinicalError error={attachments.error} />}
      {attachments.data &&
        (attachments.data.length === 0 ? (
          <p className="text-sm text-slate-600">Aún no hay archivos adjuntos.</p>
        ) : (
          <Table caption="Archivos adjuntos del paciente">
            <thead>
              <tr>
                <Th>Archivo</Th>
                <Th>Tipo</Th>
                <Th>Tamaño</Th>
                <Th>Subido (hora de Lima)</Th>
                <Th>Consentimiento</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {attachments.data.map((attachment) => (
                <AttachmentRow key={attachment.id} attachment={attachment} />
              ))}
            </tbody>
          </Table>
        ))}
    </section>
  )
}
