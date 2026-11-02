import { useState } from 'react'

import { Button, Field, Input } from '@/shared/ui'

export const CANCEL_REASON_MAX = 200

const SUGGESTED_REASONS = [
  'Paciente no puede asistir',
  'Paciente reprogramará',
  'Doctor no disponible',
  'Error al agendar',
] as const

interface CancelAppointmentFormProps {
  onConfirm: (reason: string) => void
  onBack: () => void
  loading: boolean
  /** Quién/qué se cancela, para la etiqueta del botón y lectores de pantalla. */
  summary: string
}

/** Motivo OBLIGATORIO al cancelar: queda en la cita y explica por qué se liberó el hueco. */
export function CancelAppointmentForm({
  onConfirm,
  onBack,
  loading,
  summary,
}: CancelAppointmentFormProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()

  function submit() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Indique el motivo de la cancelación')
      return
    }
    onConfirm(trimmed)
  }

  return (
    <form
      noValidate
      aria-label="Cancelar cita"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-slate-700">
        Se cancelará {summary}. El horario quedará libre para otros pacientes.
      </p>
      <Field label="Motivo de la cancelación" error={error} required>
        {(c) => (
          <Input
            {...c}
            value={reason}
            maxLength={CANCEL_REASON_MAX}
            autoComplete="off"
            autoFocus
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
        <Button variant="secondary" onClick={onBack} disabled={loading}>
          Volver
        </Button>
        <Button type="submit" variant="danger" loading={loading}>
          Cancelar la cita
        </Button>
      </div>
    </form>
  )
}
