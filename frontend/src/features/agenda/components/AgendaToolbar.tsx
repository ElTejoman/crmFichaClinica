import { Button, Field, Input } from '@/shared/ui'

import type { AgendaMode, AgendaParams, AgendaScope } from '../agendaParams'

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-md border border-slate-400"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`min-h-10 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 ${
            option.value === value
              ? 'bg-brand-700 text-white'
              : 'bg-white text-slate-800 hover:bg-slate-100'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function AgendaToolbar({
  params,
  todayKey,
  onChange,
  onShift,
}: {
  params: AgendaParams
  todayKey: string
  onChange: (changes: Partial<AgendaParams>) => void
  onShift: (direction: 1 | -1) => void
}) {
  const unit = params.scope === 'dia' ? 'día' : 'semana'
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => onChange({ dateKey: todayKey })}>
          Hoy
        </Button>
        <Button
          variant="secondary"
          aria-label={`Ir al ${unit} anterior`}
          onClick={() => onShift(-1)}
        >
          ‹ Anterior
        </Button>
        <Button
          variant="secondary"
          aria-label={`Ir al ${unit} siguiente`}
          onClick={() => onShift(1)}
        >
          Siguiente ›
        </Button>
      </div>
      <div className="w-44">
        <Field label="Ir a la fecha">
          {(c) => (
            <Input
              type="date"
              value={params.dateKey}
              onChange={(e) => {
                if (e.target.value) onChange({ dateKey: e.target.value })
              }}
              {...c}
            />
          )}
        </Field>
      </div>
      <Segmented<AgendaScope>
        label="Periodo"
        value={params.scope}
        onChange={(scope) => onChange({ scope })}
        options={[
          { value: 'semana', label: 'Semana' },
          { value: 'dia', label: 'Día' },
        ]}
      />
      <Segmented<AgendaMode>
        label="Forma de ver"
        value={params.mode}
        onChange={(mode) => onChange({ mode })}
        options={[
          { value: 'calendario', label: 'Calendario' },
          { value: 'lista', label: 'Lista' },
        ]}
      />
    </div>
  )
}
