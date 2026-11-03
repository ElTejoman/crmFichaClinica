import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button, Dialog, Field, Input, Textarea } from '@/shared/ui'

import { useAddAddendum } from '../api/useEncounters'
import {
  addendumFormSchema,
  EMPTY_ADDENDUM_VALUES,
  toAddendumCreate,
  type AddendumFormValues,
} from '../schemas'
import { ClinicalError } from './ClinicalError'

interface AddendumDialogProps {
  open: boolean
  onClose: () => void
  encounterId: string
  onAdded: () => void
}

/** Adenda: la única forma de corregir o ampliar un encuentro firmado (no altera lo firmado). */
export function AddendumDialog({ open, onClose, encounterId, onAdded }: AddendumDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Agregar adenda"
      description="El contenido firmado no cambia: la adenda se añade debajo, con su fecha y su firmante."
      size="lg"
    >
      {open && <AddendumForm encounterId={encounterId} onClose={onClose} onAdded={onAdded} />}
    </Dialog>
  )
}

function AddendumForm({
  encounterId,
  onClose,
  onAdded,
}: Pick<AddendumDialogProps, 'encounterId' | 'onClose' | 'onAdded'>) {
  const add = useAddAddendum(encounterId)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddendumFormValues>({
    resolver: zodResolver(addendumFormSchema),
    defaultValues: EMPTY_ADDENDUM_VALUES,
  })

  async function submit(values: AddendumFormValues) {
    try {
      await add.mutateAsync(toAddendumCreate(values))
      onAdded()
      onClose()
    } catch {
      // El error queda en `add.error` y se muestra arriba; el diálogo sigue abierto con lo escrito.
    }
  }

  return (
    <form
      noValidate
      aria-label="Agregar adenda"
      onSubmit={handleSubmit(submit)}
      className="flex flex-col gap-4"
    >
      {add.isError && <ClinicalError error={add.error} />}
      <Field label="Motivo de la adenda" required error={errors.reason?.message}>
        {(c) => <Input {...c} maxLength={200} autoComplete="off" {...register('reason')} />}
      </Field>
      <Field label="Texto de la adenda" required error={errors.text?.message}>
        {(c) => <Textarea {...c} rows={5} maxLength={5000} {...register('text')} />}
      </Field>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={add.isPending}>
          Guardar adenda
        </Button>
      </div>
    </form>
  )
}
