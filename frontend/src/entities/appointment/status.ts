import type { BadgeTone } from '@/shared/ui'
import type { AppointmentStatus } from '@/shared/types/aliases'

export interface StatusPresentation {
  tone: BadgeTone
  /** Símbolo que acompaña al texto: el color nunca es el único canal (WCAG 1.4.1). */
  icon: string
  /** Clases del bloque del calendario (fondo + borde izquierdo). */
  blockClass: string
}

export const STATUS_PRESENTATION: Record<AppointmentStatus, StatusPresentation> = {
  SCHEDULED: {
    tone: 'neutral',
    icon: '○',
    blockClass: 'bg-slate-100 border-slate-500 text-slate-900',
  },
  CONFIRMED: {
    tone: 'brand',
    icon: '✓',
    blockClass: 'bg-brand-50 border-brand-700 text-slate-900',
  },
  CHECKED_IN: {
    tone: 'warning',
    icon: '⏳',
    blockClass: 'bg-amber-50 border-amber-600 text-slate-900',
  },
  IN_PROGRESS: {
    tone: 'brand',
    icon: '▶',
    blockClass: 'bg-sky-100 border-sky-700 text-slate-900',
  },
  COMPLETED: {
    tone: 'success',
    icon: '✔',
    blockClass: 'bg-green-50 border-green-700 text-slate-900',
  },
  NO_SHOW: {
    tone: 'danger',
    icon: '∅',
    blockClass: 'bg-red-50 border-red-700 text-slate-700 opacity-70',
  },
  CANCELLED: {
    tone: 'neutral',
    icon: '✕',
    blockClass: 'bg-white border-slate-400 text-slate-600 opacity-70 line-through',
  },
}

/** Estados que liberan el hueco (el servidor ya no los cuenta como ocupados). */
export const RELEASED_STATUSES: readonly AppointmentStatus[] = ['CANCELLED', 'NO_SHOW']

/** Citas que aún pueden pasar por el flujo (no terminadas). */
export const OPEN_STATUSES: readonly AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
]

export function isReleased(status: AppointmentStatus): boolean {
  return RELEASED_STATUSES.includes(status)
}

export function isOpen(status: AppointmentStatus): boolean {
  return OPEN_STATUSES.includes(status)
}
