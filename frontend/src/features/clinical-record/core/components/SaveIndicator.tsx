import { Button, Spinner } from '@/shared/ui'

import type { AutosaveStatus } from '../hooks/useAutosave'

const TEXT: Record<AutosaveStatus, string> = {
  idle: 'Guardado',
  saved: 'Guardado',
  saving: 'Guardando…',
  dirty: 'Cambios sin guardar…',
  error: 'Error al guardar',
}

/**
 * Estado del autoguardado. El estado se dice con texto (no solo con color) y en una región
 * `aria-live="polite"` para que un lector de pantalla lo anuncie sin interrumpir la escritura.
 */
export function SaveIndicator({
  status,
  onRetry,
}: {
  status: AutosaveStatus
  onRetry?: () => void
}) {
  const failed = status === 'error'
  return (
    <div className="flex items-center gap-2 text-sm">
      <p
        role="status"
        aria-live="polite"
        className={`flex items-center gap-1.5 font-medium ${failed ? 'text-red-800' : 'text-slate-700'}`}
      >
        {status === 'saving' ? (
          <Spinner />
        ) : (
          <span aria-hidden="true">{failed ? '⚠' : status === 'dirty' ? '•' : '✓'}</span>
        )}
        {TEXT[status]}
      </p>
      {failed && onRetry && (
        <Button variant="secondary" className="min-h-8 px-2.5 py-1 text-xs" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}
