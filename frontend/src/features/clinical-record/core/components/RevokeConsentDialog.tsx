import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import type { ConsentRead } from '@/shared/types/aliases'
import { Button, Dialog, Field, Input } from '@/shared/ui'

import { useRevokeConsent } from '../api/useConsents'
import { CONSENT_TYPE_LABELS } from '../labels'
import { revokeFormSchema, type RevokeFormValues } from '../schemas'
import { ClinicalError } from './ClinicalError'

interface RevokeConsentDialogProps {
  consent: ConsentRead | null
  patientId: string
  onClose: () => void
  onRevoked: () => void
}

export function RevokeConsentDialog({
  consent,
  patientId,
  onClose,
  onRevoked,
}: RevokeConsentDialogProps) {
  return (
    <Dialog
      open={consent !== null}
      onClose={onClose}
      title="Revocar consentimiento"
      description="La revocación queda registrada con su motivo y fecha; el consentimiento no se borra."
    >
      {consent && (
        <RevokeForm
          consent={consent}
          patientId={patientId}
          onClose={onClose}
          onRevoked={onRevoked}
        />
      )}
    </Dialog>
  )
}

function RevokeForm({
  consent,
  patientId,
  onClose,
  onRevoked,
}: {
  consent: ConsentRead
  patientId: string
  onClose: () => void
  onRevoked: () => void
}) {
  const revoke = useRevokeConsent(patientId)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RevokeFormValues>({
    resolver: zodResolver(revokeFormSchema),
    defaultValues: { reason: '' },
  })

  async function submit(values: RevokeFormValues) {
    try {
      await revoke.mutateAsync({ id: consent.id, reason: values.reason.trim() })
      onRevoked()
      onClose()
    } catch {
      // El error se muestra arriba; el diálogo permanece abierto.
    }
  }

  return (
    <form
      noValidate
      aria-label="Revocar consentimiento"
      onSubmit={handleSubmit(submit)}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-slate-800">
        Se revocará: <strong>{CONSENT_TYPE_LABELS[consent.type]}</strong>. Un consentimiento general
        revocado impide firmar nuevos encuentros.
      </p>
      {revoke.isError && <ClinicalError error={revoke.error} />}
      <Field label="Motivo de la revocación" required error={errors.reason?.message}>
        {(c) => <Input {...c} maxLength={200} autoComplete="off" {...register('reason')} />}
      </Field>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={revoke.isPending}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" loading={revoke.isPending}>
          Revocar consentimiento
        </Button>
      </div>
    </form>
  )
}
