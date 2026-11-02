import { useState } from 'react'

import { Button, Dialog, Field, Input } from '@/shared/ui'

import { LOST_REASON_MAX } from '../schemas'

/** Motivos frecuentes: fomentan textos consistentes, que es lo que permite agruparlos en las estadísticas. */
const SUGGESTED_REASONS = [
  'Precio',
  'No contestó',
  'Eligió otra clínica',
  'Sin interés',
  'Ubicación',
] as const

interface LostReasonDialogProps {
  leadName: string | null
  onConfirm: (reason: string) => void
  onCancel: () => void
  loading?: boolean
}

/** Pide el motivo al marcar un lead como Perdido (el servidor también lo exige). */
export function LostReasonDialog({
  leadName,
  onConfirm,
  onCancel,
  loading,
}: LostReasonDialogProps) {
  return (
    <Dialog
      open={leadName !== null}
      onClose={onCancel}
      title="Marcar como perdido"
      description={leadName ? `Indique por qué se perdió a ${leadName}.` : undefined}
    >
      {/* Se monta solo abierto: así el motivo se reinicia en cada uso. */}
      {leadName !== null && (
        <ReasonForm onConfirm={onConfirm} onCancel={onCancel} loading={loading ?? false} />
      )}
    </Dialog>
  )
}

function ReasonForm({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (reason: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()

  function submit() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Indique el motivo por el que se perdió el lead')
      return
    }
    onConfirm(trimmed)
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Motivo de pérdida" error={error} required>
        {(c) => (
          <Input
            {...c}
            value={reason}
            maxLength={LOST_REASON_MAX}
            autoComplete="off"
            onChange={(e) => {
              setReason(e.target.value)
              setError(undefined)
            }}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos frecuentes">
        {SUGGESTED_REASONS.map((suggestion) => (
          <Button
            key={suggestion}
            variant="secondary"
            className="min-h-8 px-2.5 py-1 text-xs"
            onClick={() => {
              setReason(suggestion)
              setError(undefined)
            }}
          >
            {suggestion}
          </Button>
        ))}
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" loading={loading}>
          Marcar como perdido
        </Button>
      </div>
    </form>
  )
}
