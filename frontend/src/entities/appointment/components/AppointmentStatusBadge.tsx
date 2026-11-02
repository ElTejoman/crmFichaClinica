import { APPOINTMENT_STATUS_LABELS } from '@/shared/lib/labels'
import type { AppointmentStatus } from '@/shared/types/aliases'
import { Badge } from '@/shared/ui'

import { STATUS_PRESENTATION } from '../status'

/** Estado de la cita: texto + símbolo + color (nunca solo color). */
export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const { tone, icon } = STATUS_PRESENTATION[status]
  return (
    <Badge tone={tone} icon={icon}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </Badge>
  )
}
