import { useId } from 'react'

import { FOCUS_RING } from './focus'

export interface CheckboxOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
  hint?: string
}

interface CheckboxGroupProps<T extends string> {
  legend: string
  options: readonly CheckboxOption<T>[]
  value: readonly T[]
  onChange: (value: T[]) => void
  error?: string | undefined
  required?: boolean
}

/** Grupo de casillas con `fieldset/legend` (lectores de pantalla anuncian el grupo y el error). */
export function CheckboxGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  error,
  required,
}: CheckboxGroupProps<T>) {
  const id = useId()
  const errorId = error ? `${id}-error` : undefined

  function toggle(option: T, checked: boolean) {
    onChange(checked ? [...value, option] : value.filter((v) => v !== option))
  }

  return (
    <fieldset aria-describedby={errorId} aria-required={required || undefined} className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-slate-800">
        {legend}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-red-700">
            *
          </span>
        )}
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex items-center gap-2 text-sm ${option.disabled ? 'text-slate-500' : 'text-slate-800'}`}
          >
            <input
              type="checkbox"
              className={`size-4 accent-brand-700 ${FOCUS_RING}`}
              checked={value.includes(option.value)}
              disabled={option.disabled}
              onChange={(e) => toggle(option.value, e.target.checked)}
            />
            <span>
              {option.label}
              {option.hint && <span className="ml-1 text-xs">({option.hint})</span>}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  )
}
