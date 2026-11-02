import type { ReactNode } from 'react'

type AlertTone = 'info' | 'success' | 'warning' | 'error'

const TONE_CLASS: Record<AlertTone, string> = {
  info: 'border-sky-300 bg-sky-50 text-sky-900',
  success: 'border-green-300 bg-green-50 text-green-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-900',
}

/** Errores usan role="alert" (se anuncian ya); el resto role="status" (cortés). */
export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: AlertTone
  title?: string
  children: ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-4 py-3 text-sm ${TONE_CLASS[tone]}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  )
}
