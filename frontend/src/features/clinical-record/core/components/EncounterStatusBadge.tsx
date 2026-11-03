import type { EncounterStatus } from '@/shared/types/aliases'
import { Badge } from '@/shared/ui'

import { ENCOUNTER_STATUS_LABELS, ENCOUNTER_STATUS_PRESENTATION } from '../labels'

export function EncounterStatusBadge({ status }: { status: EncounterStatus }) {
  const { tone, icon } = ENCOUNTER_STATUS_PRESENTATION[status]
  return (
    <Badge tone={tone} icon={icon}>
      {ENCOUNTER_STATUS_LABELS[status]}
    </Badge>
  )
}
