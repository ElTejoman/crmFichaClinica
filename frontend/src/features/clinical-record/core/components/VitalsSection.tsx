import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import type { VitalContext, VitalSignsRead } from '@/shared/types/aliases'
import { Alert, Button, CheckboxField, Field, Input, Select } from '@/shared/ui'

import {
  emptyVitalRow,
  VITAL_FIELD_SPECS,
  type EncounterFormValues,
  type VitalIssue,
  type VitalRowValues,
} from '../encounterForm'
import { VITAL_CONTEXT_LABELS } from '../labels'
import { ClinicalError } from './ClinicalError'

const SERIES_CONTEXTS: readonly VitalContext[] = ['PRE', 'DURING', 'POST']
const MAX_VITAL_ROWS = 8
const NOT_APPLICABLE_REASON_MAX = 200

function hasValues(row: VitalRowValues): boolean {
  return VITAL_FIELD_SPECS.some((spec) => row[spec.key].trim() !== '')
}

function formatBmi(bmi: number): string {
  return bmi.toFixed(1).replace('.', ',')
}

interface VitalsSectionProps {
  issues: readonly VitalIssue[]
  /** Mediciones ya guardadas: de ahí sale el IMC, que SIEMPRE calcula el servidor. */
  savedVitals: readonly VitalSignsRead[]
  saveError: unknown
}

/**
 * Signos vitales: una medición o una serie antes/durante/después (sueroterapia), o «no aplica»
 * con motivo. No hay campo de IMC: se muestra el que devuelve el servidor tras guardar.
 */
export function VitalsSection({ issues, savedVitals, saveError }: VitalsSectionProps) {
  const { register, control, setValue, getValues } = useFormContext<EncounterFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'vitals' })
  const mode = useWatch({ control, name: 'vitals_mode' })
  const notApplicable = useWatch({ control, name: 'vitals_not_applicable' })
  const rows = useWatch({ control, name: 'vitals' })

  const anyValues = rows.some(hasValues)
  const onlyFirstHasValues = rows.slice(1).every((row) => !hasValues(row))
  const bmis = savedVitals.flatMap((v) =>
    v.bmi === null ? [] : [{ context: v.context, measuredAt: v.measured_at, bmi: v.bmi }],
  )

  function chooseMode(next: 'single' | 'series') {
    setValue('vitals_mode', next, { shouldDirty: true })
    if (next === 'series') {
      setValue('vitals.0.context', 'PRE', { shouldDirty: true })
      if (getValues('vitals').length < 2) append(emptyVitalRow('POST'))
    } else {
      setValue('vitals.0.context', 'SINGLE', { shouldDirty: true })
      for (let i = getValues('vitals').length - 1; i >= 1; i -= 1) remove(i)
    }
  }

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-semibold text-slate-900">Signos vitales</legend>

      <CheckboxField
        label="Los signos vitales no aplican en esta atención"
        disabled={anyValues && !notApplicable}
        hint={
          anyValues && !notApplicable
            ? 'Hay signos vitales escritos; bórrelos para marcar esta opción.'
            : undefined
        }
        {...register('vitals_not_applicable')}
      />
      {notApplicable && (
        <Field label="Motivo por el que no aplican" required>
          {(c) => (
            <Input
              {...c}
              maxLength={NOT_APPLICABLE_REASON_MAX}
              autoComplete="off"
              {...register('vitals_not_applicable_reason')}
            />
          )}
        </Field>
      )}

      {!notApplicable && (
        <>
          <div
            role="radiogroup"
            aria-label="Tipo de registro"
            className="flex flex-wrap gap-4 text-sm"
          >
            <label className="flex items-center gap-2 text-slate-800">
              <input
                type="radio"
                name="vitals-mode"
                className="size-4 accent-brand-700"
                checked={mode === 'single'}
                disabled={mode === 'series' && !onlyFirstHasValues}
                onChange={() => chooseMode('single')}
              />
              Medición única
            </label>
            <label className="flex items-center gap-2 text-slate-800">
              <input
                type="radio"
                name="vitals-mode"
                className="size-4 accent-brand-700"
                checked={mode === 'series'}
                onChange={() => chooseMode('series')}
              />
              Serie antes · durante · después
            </label>
          </div>
          {mode === 'series' && !onlyFirstHasValues && (
            <p className="text-xs text-slate-600">
              Para volver a «Medición única» deje vacías las mediciones después de la primera.
            </p>
          )}

          {fields.map((field, index) => (
            <fieldset key={field.id} className="rounded-lg border border-slate-300 bg-slate-50 p-3">
              <legend className="px-1 text-sm font-medium text-slate-800">
                {mode === 'single' ? VITAL_CONTEXT_LABELS.SINGLE : `Medición ${index + 1}`}
              </legend>
              {mode === 'series' && (
                <div className="mb-3 flex flex-wrap items-end gap-3">
                  <Field label="Momento">
                    {(c) => (
                      <Select {...c} {...register(`vitals.${index}.context`)}>
                        {SERIES_CONTEXTS.map((ctx) => (
                          <option key={ctx} value={ctx}>
                            {VITAL_CONTEXT_LABELS[ctx]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {fields.length > 1 && (
                    <Button
                      variant="secondary"
                      className="min-h-10"
                      aria-label={`Quitar medición ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      Quitar medición
                    </Button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {VITAL_FIELD_SPECS.map((spec) => (
                  <Field
                    key={spec.key}
                    label={`${spec.label} (${spec.unit})`}
                    error={issues.find((i) => i.index === index && i.field === spec.key)?.message}
                  >
                    {(c) => (
                      <Input
                        {...c}
                        inputMode={spec.integer ? 'numeric' : 'decimal'}
                        autoComplete="off"
                        {...register(`vitals.${index}.${spec.key}`)}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </fieldset>
          ))}

          {mode === 'series' && fields.length < MAX_VITAL_ROWS && (
            <div>
              <Button variant="secondary" onClick={() => append(emptyVitalRow('DURING'))}>
                Agregar medición
              </Button>
            </div>
          )}

          <div aria-live="polite" className="text-sm text-slate-800 empty:hidden">
            {bmis.map((v, index) => (
              <p key={`${v.context}-${v.measuredAt}-${index}`}>
                IMC {mode === 'series' ? `(${VITAL_CONTEXT_LABELS[v.context]}) ` : ''}
                {formatBmi(v.bmi)} kg/m²
                <span className="text-slate-600"> · calculado por el servidor al guardar</span>
              </p>
            ))}
          </div>
        </>
      )}

      {issues.length > 0 && (
        <Alert tone="warning" title="Revise los signos vitales">
          Corrija los campos marcados: no se guardan hasta que sean válidos.
        </Alert>
      )}
      {saveError !== null && saveError !== undefined && <ClinicalError error={saveError} />}
    </fieldset>
  )
}
