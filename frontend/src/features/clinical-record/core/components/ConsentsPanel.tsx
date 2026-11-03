import { useState } from 'react'

import { formatShortDateTimeLima } from '@/shared/lib/dates'
import type { ConsentRead } from '@/shared/types/aliases'
import { Alert, Badge, Button, Spinner, Table, Td, Th } from '@/shared/ui'

import { useConsents } from '../api/useConsents'
import { CONSENT_METHOD_LABELS, CONSENT_TYPE_LABELS } from '../labels'
import { ConsentCaptureDialog, type ConsentPatient } from './ConsentCaptureDialog'
import { ClinicalError } from './ClinicalError'
import { RevokeConsentDialog } from './RevokeConsentDialog'
import { SignatureViewDialog } from './SignatureViewDialog'

interface ConsentsPanelProps {
  patientId: string
  patient: ConsentPatient
  /** `consents:capture`: OWNER, DOCTOR y RECEPTION. */
  canCapture: boolean
  /** `clinical:read`: ver la IMAGEN de la firma es acceso clínico (recepción no). */
  canViewSignature: boolean
}

/** Consentimientos del paciente: lista, captura con plantilla visible, revocación y ver firma. */
export function ConsentsPanel({
  patientId,
  patient,
  canCapture,
  canViewSignature,
}: ConsentsPanelProps) {
  const consents = useConsents(patientId)
  const [capturing, setCapturing] = useState(false)
  const [revoking, setRevoking] = useState<ConsentRead | null>(null)
  const [viewing, setViewing] = useState<ConsentRead | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const hasGeneral = consents.data?.some((c) => c.type === 'GENERAL_CARE' && c.is_valid) ?? false

  return (
    <section aria-labelledby="consents-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="consents-title" className="text-lg font-semibold text-slate-900">
          Consentimientos
        </h3>
        {canCapture && (
          <Button
            onClick={() => {
              setMessage(null)
              setCapturing(true)
            }}
          >
            Registrar consentimiento
          </Button>
        )}
      </div>
      <div aria-live="polite" className="empty:hidden">
        {message && <Alert tone="success">{message}</Alert>}
      </div>
      {consents.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando consentimientos…
        </p>
      )}
      {consents.isError && <ClinicalError error={consents.error} />}
      {consents.data && !hasGeneral && (
        <Alert tone="warning" title="Sin consentimiento general vigente">
          Sin él no se puede firmar ningún encuentro de este paciente.
        </Alert>
      )}
      {consents.data &&
        (consents.data.length === 0 ? (
          <p className="text-sm text-slate-600">Aún no hay consentimientos registrados.</p>
        ) : (
          <Table caption="Consentimientos informados del paciente">
            <thead>
              <tr>
                <Th>Consentimiento</Th>
                <Th>Versión del texto</Th>
                <Th>Método</Th>
                <Th>Firmó</Th>
                <Th>Fecha (hora de Lima)</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {consents.data.map((consent) => (
                <tr key={consent.id}>
                  <Td>{CONSENT_TYPE_LABELS[consent.type]}</Td>
                  <Td>v{consent.text_version}</Td>
                  <Td>{CONSENT_METHOD_LABELS[consent.method]}</Td>
                  <Td>
                    {consent.signed_by_name}
                    {consent.signer_relation && (
                      <span className="text-slate-600"> ({consent.signer_relation})</span>
                    )}
                  </Td>
                  <Td>{formatShortDateTimeLima(consent.signed_at)}</Td>
                  <Td>
                    {consent.is_valid ? (
                      <Badge tone="success" icon="✓">
                        Vigente
                      </Badge>
                    ) : (
                      <>
                        <Badge tone="neutral" icon="✕">
                          Revocado
                        </Badge>
                        {consent.revoked_reason && (
                          <p className="mt-1 max-w-56 text-xs text-slate-600">
                            Motivo: {consent.revoked_reason}
                          </p>
                        )}
                      </>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {canViewSignature && consent.has_signature_image && (
                        <Button
                          variant="secondary"
                          className="min-h-8 px-2.5 py-1 text-xs"
                          aria-label={`Ver firma: ${CONSENT_TYPE_LABELS[consent.type]} (v${consent.text_version})`}
                          onClick={() => setViewing(consent)}
                        >
                          Ver firma
                        </Button>
                      )}
                      {canCapture && consent.is_valid && (
                        <Button
                          variant="secondary"
                          className="min-h-8 px-2.5 py-1 text-xs"
                          aria-label={`Revocar: ${CONSENT_TYPE_LABELS[consent.type]} (v${consent.text_version})`}
                          onClick={() => setRevoking(consent)}
                        >
                          Revocar
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}

      <ConsentCaptureDialog
        open={capturing}
        onClose={() => setCapturing(false)}
        patientId={patientId}
        patient={patient}
        onCaptured={() => setMessage('Consentimiento registrado.')}
      />
      <RevokeConsentDialog
        consent={revoking}
        patientId={patientId}
        onClose={() => setRevoking(null)}
        onRevoked={() => setMessage('Consentimiento revocado.')}
      />
      <SignatureViewDialog consent={viewing} onClose={() => setViewing(null)} />
    </section>
  )
}
