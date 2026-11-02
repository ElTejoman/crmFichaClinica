import { Badge, type BadgeTone } from '@/shared/ui'

import { describeNextAction, type NextActionKind } from '../nextAction'

const TONE: Record<NextActionKind, BadgeTone> = {
  none: 'neutral',
  overdue: 'danger',
  today: 'warning',
  upcoming: 'neutral',
}
const ICON: Record<NextActionKind, string | undefined> = {
  none: undefined,
  overdue: '⚠',
  today: '●',
  upcoming: '○',
}

/** Próxima acción con color + ícono + texto ("Vencida · fecha"): el color no es el único canal. */
export function NextActionBadge({ nextActionAt, now }: { nextActionAt: string | null; now: Date }) {
  const info = describeNextAction(nextActionAt, now)
  if (info.kind === 'none') return null
  return (
    <Badge tone={TONE[info.kind]} icon={ICON[info.kind]}>
      {info.label}
    </Badge>
  )
}
