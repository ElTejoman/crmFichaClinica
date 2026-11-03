import { useEffect } from 'react'

import type { ConsentRead } from '@/shared/types/aliases'
import { Alert, Button, Dialog, Spinner } from '@/shared/ui'

import { useSignatureImage } from '../api/useConsents'
import { CONSENT_TYPE_LABELS } from '../labels'
import { PNG_DATA_URL_PREFIX } from '../schemas'
import { ClinicalError } from './ClinicalError'

interface SignatureViewDialogProps {
  consent: ConsentRead | null
  onClose: () => void
}

/** Ver la firma es acceso clínico (el servidor lo exige). La imagen no se guarda en caché. */
export function SignatureViewDialog({ consent, onClose }: SignatureViewDialogProps) {
  return (
    <Dialog
      open={consent !== null}
      onClose={onClose}
      title="Firma del consentimiento"
      description={consent ? CONSENT_TYPE_LABELS[consent.type] : undefined}
    >
      {consent && <SignatureBody consentId={consent.id} onClose={onClose} />}
    </Dialog>
  )
}

function SignatureBody({ consentId, onClose }: { consentId: string; onClose: () => void }) {
  const signature = useSignatureImage()
  const { mutate } = signature
  useEffect(() => {
    mutate(consentId)
  }, [mutate, consentId])

  // Solo se dibuja si es un PNG en data URL (lo que el servidor admite al capturar).
  const image = signature.data?.image
  const renderable = image !== undefined && image.startsWith(PNG_DATA_URL_PREFIX)

  return (
    <div className="flex flex-col gap-4">
      {signature.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando firma…
        </p>
      )}
      {signature.isError && <ClinicalError error={signature.error} />}
      {image !== undefined && !renderable && (
        <Alert tone="error">La firma guardada no tiene un formato de imagen válido.</Alert>
      )}
      {renderable && (
        <img
          src={image}
          alt="Firma manuscrita capturada en pantalla"
          className="max-w-full rounded-md border border-slate-300 bg-white"
        />
      )}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
