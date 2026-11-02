import { useId, type ComponentProps, type ReactNode } from 'react'

import { FOCUS_RING } from './focus'

interface CheckboxFieldProps extends Omit<ComponentProps<'input'>, 'type' | 'children'> {
  label: ReactNode
  error?: string | undefined
  hint?: string
}

/** Casilla única con etiqueta clicable, ayuda y error enlazados (consentimientos, filtros). */
export function CheckboxField({ label, error, hint, className = '', ...rest }: CheckboxFieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm text-slate-800">
        <input
          id={id}
          type="checkbox"
          aria-invalid={Boolean(error)}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={`mt-0.5 size-4 shrink-0 accent-brand-700 ${FOCUS_RING} ${className}`}
          {...rest}
        />
        <span>{label}</span>
      </label>
      {hint && (
        <p id={hintId} className="pl-6.5 text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="pl-6.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
