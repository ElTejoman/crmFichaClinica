import { Field, Input } from '@/shared/ui'

import { MAX_AVAILABILITY_DAYS, rangeError } from '../booking'

/** "Desde / hasta" para buscar huecos. Valida el máximo de 14 días antes de llamar al servidor. */
export function DateRangeFields({
  from,
  to,
  onChange,
}: {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}) {
  const error = rangeError(from, to)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Desde" required>
        {(c) => (
          <Input
            type="date"
            value={from}
            onChange={(e) => onChange({ from: e.target.value, to })}
            {...c}
          />
        )}
      </Field>
      <Field
        label="Hasta"
        required
        hint={`Máximo ${MAX_AVAILABILITY_DAYS} días por búsqueda.`}
        error={error ?? undefined}
      >
        {(c) => (
          <Input
            type="date"
            value={to}
            onChange={(e) => onChange({ from, to: e.target.value })}
            {...c}
          />
        )}
      </Field>
    </div>
  )
}
