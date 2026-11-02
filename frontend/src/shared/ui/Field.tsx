import { useId, type ReactNode } from 'react'

/** Atributos que el control debe recibir para quedar asociado a su etiqueta, ayuda y error. */
export interface FieldControlProps {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': boolean
  'aria-required': boolean | undefined
}

interface FieldProps {
  label: string
  error?: string | undefined
  hint?: string
  required?: boolean
  children: (control: FieldControlProps) => ReactNode
}

/** Etiqueta + control + ayuda + error enlazados con aria-* (render-prop para tipar el control). */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-red-700">
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(error),
        'aria-required': required || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
