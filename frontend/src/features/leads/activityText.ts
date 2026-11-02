import { LEAD_STATUS_LABELS } from '@/shared/lib/labels'
import type { LeadStatus } from '@/shared/types/aliases'

const STATUS_CHANGE = /^([A-Z_]+) → ([A-Z_]+)$/

function statusLabel(code: string): string {
  return (LEAD_STATUS_LABELS as Record<string, string>)[code] ?? code
}

/**
 * El servidor guarda los cambios de estado como texto técnico ("NEW → CONTACTED"). Se muestra
 * con las etiquetas en español; cualquier otra nota (escrita por una persona) pasa sin tocar.
 */
export function describeActivityNotes(type: string, notes: string | null): string | null {
  if (!notes || type !== 'STATUS_CHANGE') return notes
  const match = STATUS_CHANGE.exec(notes)
  if (!match) return notes
  return `${statusLabel(match[1] as LeadStatus)} → ${statusLabel(match[2] as LeadStatus)}`
}
