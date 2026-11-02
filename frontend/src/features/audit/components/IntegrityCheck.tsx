import { ApiError } from '@/shared/lib/http'
import { Alert, Button } from '@/shared/ui'

import { useVerifyAuditChain } from '../api/useAudit'

/** Botón + resultado claro de la verificación de la cadena de hash (evidencia de manipulación). */
export function IntegrityCheck() {
  const verify = useVerifyAuditChain()
  const result = verify.data
  return (
    <section aria-labelledby="integrity-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="integrity-title" className="text-base font-semibold text-slate-900">
          Integridad del registro
        </h2>
        <Button variant="secondary" loading={verify.isPending} onClick={() => verify.mutate()}>
          Verificar integridad
        </Button>
      </div>
      {result?.valid && (
        <Alert tone="success" title="Cadena de auditoría íntegra">
          Se verificaron {result.checked} eventos y ninguno ha sido alterado.
        </Alert>
      )}
      {result && !result.valid && (
        <Alert tone="error" title="Cadena de auditoría alterada">
          {result.first_broken_id === null
            ? 'Se detectó una alteración en el registro.'
            : `La cadena está alterada desde el evento #${result.first_broken_id}.`}{' '}
          Se revisaron {result.checked} eventos. Avise al responsable de seguridad.
        </Alert>
      )}
      {verify.isError && (
        <Alert tone="error">
          {verify.error instanceof ApiError
            ? verify.error.message
            : 'No se pudo verificar la integridad.'}
        </Alert>
      )}
    </section>
  )
}
