import { Dialog } from '@/shared/ui'

import { BookingWizard, type BookingPrefill, type BookingResult } from './BookingWizard'

/** «Nueva cita» como diálogo desde el calendario; el mismo asistente que la página. */
export function NewAppointmentDialog({
  open,
  prefill,
  onClose,
  onCreated,
}: {
  open: boolean
  prefill?: BookingPrefill
  onClose: () => void
  onCreated: (result: BookingResult) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Nueva cita" size="xl">
      {/* Se monta solo abierto: el borrador se reinicia en cada uso. */}
      {open && (
        <BookingWizard {...(prefill ? { prefill } : {})} onCreated={onCreated} onCancel={onClose} />
      )}
    </Dialog>
  )
}
