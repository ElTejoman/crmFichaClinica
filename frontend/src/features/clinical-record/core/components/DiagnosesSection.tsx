import type { DiagnosisType } from '@/shared/types/aliases'
import { Alert, Button, Input, Select } from '@/shared/ui'

import { DIAGNOSIS_TYPE_LABELS } from '../labels'
import { diagnosisIssues, withSinglePrimary, type DiagnosisValues } from '../encounterForm'
import { normalizeIcd10Code } from '../icd10'
import { Icd10Combobox, type Icd10Choice } from './Icd10Combobox'
import { ClinicalError } from './ClinicalError'

const DIAGNOSIS_TYPES: readonly DiagnosisType[] = ['DEFINITIVE', 'PRESUMPTIVE']
const DESCRIPTION_MAX = 300

interface DiagnosesSectionProps {
  value: readonly DiagnosisValues[]
  onChange: (next: DiagnosisValues[]) => void
  /** Error devuelto por el servidor al guardar este grupo (p. ej. `invalid_diagnosis`). */
  saveError: unknown
}

/**
 * Diagnósticos CIE-10 del encuentro. Siempre hay exactamente UN principal (como exige el
 * servidor): al quitar el principal pasa al primero que quede.
 */
export function DiagnosesSection({ value, onChange, saveError }: DiagnosesSectionProps) {
  const issues = diagnosisIssues(value)

  function add(choice: Icd10Choice) {
    const code = normalizeIcd10Code(choice.code) ?? choice.code
    if (value.some((d) => normalizeIcd10Code(d.icd10_code) === code)) return
    onChange(
      withSinglePrimary([
        ...value,
        {
          icd10_code: code,
          description: choice.description,
          type: 'DEFINITIVE',
          is_primary: value.length === 0,
          from_catalog: choice.fromCatalog,
        },
      ]),
    )
  }

  function patch(index: number, changes: Partial<DiagnosisValues>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...changes } : row)))
  }

  function setPrimary(index: number) {
    onChange(value.map((row, i) => ({ ...row, is_primary: i === index })))
  }

  function remove(index: number) {
    onChange(withSinglePrimary(value.filter((_, i) => i !== index)))
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-slate-900">Diagnósticos CIE-10</legend>
      {value.length === 0 ? (
        <p className="text-sm text-slate-600">
          Aún no hay diagnósticos. Se necesita al menos uno para firmar.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {value.map((row, index) => (
            <li
              key={row.icd10_code}
              className="grid gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 md:grid-cols-[1fr_auto]"
            >
              <div className="flex flex-col gap-1.5">
                <p className="text-sm">
                  <strong className="text-slate-900">{row.icd10_code}</strong>
                  {row.from_catalog && <span className="text-slate-800"> — {row.description}</span>}
                </p>
                {!row.from_catalog && (
                  <Input
                    aria-label={`Descripción de ${row.icd10_code}`}
                    placeholder="Descripción del diagnóstico (no está en el catálogo)"
                    maxLength={DESCRIPTION_MAX}
                    autoComplete="off"
                    value={row.description}
                    onChange={(event) => patch(index, { description: event.target.value })}
                  />
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    aria-label={`Tipo de diagnóstico ${row.icd10_code}`}
                    className="w-auto"
                    value={row.type}
                    onChange={(event) => {
                      const type = DIAGNOSIS_TYPES.find((t) => t === event.target.value)
                      if (type) patch(index, { type })
                    }}
                  >
                    {DIAGNOSIS_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DIAGNOSIS_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="primary-diagnosis"
                      className="size-4 accent-brand-700"
                      checked={row.is_primary}
                      onChange={() => setPrimary(index)}
                    />
                    Principal
                    <span className="sr-only">: {row.icd10_code}</span>
                  </label>
                </div>
              </div>
              <div className="flex items-start">
                <Button
                  variant="secondary"
                  className="min-h-8 px-2.5 py-1 text-xs"
                  aria-label={`Quitar diagnóstico ${row.icd10_code}`}
                  onClick={() => remove(index)}
                >
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {issues.length > 0 && (
        <Alert tone="warning" title="Revise los diagnósticos (no se guardan hasta corregirlos)">
          <ul className="list-disc pl-5">
            {issues.map((issue) => (
              <li key={`${issue.index}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      {saveError !== null && saveError !== undefined && <ClinicalError error={saveError} />}
      <Icd10Combobox onSelect={add} />
    </fieldset>
  )
}
