import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-800 ring-slate-300',
  brand: 'bg-brand-50 text-brand-700 ring-brand-500/40',
  success: 'bg-green-50 text-green-800 ring-green-600/30',
  warning: 'bg-amber-50 text-amber-900 ring-amber-600/40',
  danger: 'bg-red-50 text-red-800 ring-red-600/30',
}

/** Chip de estado. Siempre lleva texto (y opcionalmente icono): el color nunca es el único canal. */
export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: BadgeTone
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASS[tone]}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  )
}
