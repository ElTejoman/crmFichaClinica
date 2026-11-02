import { formatShortDateTimeLima, limaDateKey, parseServerInstant } from '@/shared/lib/dates'

export type NextActionKind = 'none' | 'overdue' | 'today' | 'upcoming'

export interface NextActionInfo {
  kind: NextActionKind
  /** Texto que acompaña al color: el estado nunca depende solo del color (WCAG 1.4.1). */
  label: string
}

/**
 * Estado de la próxima acción de un lead respecto de `now`, en hora de Lima:
 * vencida (ya pasó), de hoy o futura. El mismo criterio que usa el servidor para "seguimientos de hoy".
 */
export function describeNextAction(nextActionAt: string | null, now: Date): NextActionInfo {
  if (!nextActionAt) return { kind: 'none', label: 'Sin próxima acción' }
  const when = parseServerInstant(nextActionAt)
  if (Number.isNaN(when.getTime())) return { kind: 'none', label: 'Sin próxima acción' }
  const text = formatShortDateTimeLima(nextActionAt)
  if (when.getTime() < now.getTime()) return { kind: 'overdue', label: `Vencida · ${text}` }
  if (limaDateKey(when) === limaDateKey(now)) return { kind: 'today', label: `Hoy · ${text}` }
  return { kind: 'upcoming', label: `Próxima · ${text}` }
}
