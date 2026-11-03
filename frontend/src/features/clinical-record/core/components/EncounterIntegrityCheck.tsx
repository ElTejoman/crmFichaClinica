import { formatDateTimeLima } from '@/shared/lib/dates'
import { Alert, Button } from '@/shared/ui'

import { useVerifyIntegrity } from '../api/useEncounters'
import { ClinicalError } from './ClinicalError'

/**
 * «Verificar integridad»: el servidor recalcula el SHA-256 del contenido firmado y lo compara con
 * el guardado al firmar. Es una huella de integridad, NO una firma digital con valor legal
 * (requisitos de firma electrónica de la HC en Perú: pendiente de verificar con un asesor).
 */
export function EncounterIntegrityCheck({ encounterId }: { encounterId: string }) {
  const verify = useVerifyIntegrity(encounterId)
  const result = verify.data
  return (
    <div className="flex flex-col gap-2" data-no-print>
      <div>
        <Button variant="secondary" loading={verify.isPending} onClick={() => verify.mutate()}>
          Verificar integridad
        </Button>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {result?.valid && (
          <Alert tone="success" title="Contenido íntegro">
            El contenido coincide con la huella SHA-256 calculada al firmar
            {result.signed_at ? ` (${formatDateTimeLima(result.signed_at)}, hora de Lima)` : ''}. No
            ha sido alterado.
          </Alert>
        )}
        {result && !result.valid && (
          <Alert tone="error" title="Contenido ALTERADO">
            El contenido NO coincide con la huella calculada al firmar. Avise de inmediato al
            responsable de seguridad.
          </Alert>
        )}
      </div>
      {verify.isError && <ClinicalError error={verify.error} />}
      <p className="text-xs text-slate-600">
        Es una huella de integridad (SHA-256); no es una firma digital con valor legal.
      </p>
    </div>
  )
}
