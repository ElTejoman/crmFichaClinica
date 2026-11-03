import { z } from 'zod'

import { limaDateKeyOf, toIsoInstant, todayLimaKey } from '@/shared/lib/dates'
import type {
  DiagnosisIn,
  DiagnosisType,
  EncounterRead,
  VitalContext,
  VitalSignsIn,
} from '@/shared/types/aliases'

import { normalizeIcd10Code } from './icd10'

/* ---------- Valores del formulario (todo texto: lo que escribe el doctor) ---------- */

export type VitalField =
  | 'systolic'
  | 'diastolic'
  | 'heart_rate'
  | 'resp_rate'
  | 'temperature_c'
  | 'spo2'
  | 'weight_kg'
  | 'height_cm'
  | 'pain_vas'

export interface VitalFieldSpec {
  key: VitalField
  label: string
  unit: string
  /** Enteros (presión, pulso…) o decimales (temperatura, peso, talla). */
  integer: boolean
}

/** Los rangos de plausibilidad los valida el servidor (`invalid_vitals`); aquí solo el formato. */
export const VITAL_FIELD_SPECS: readonly VitalFieldSpec[] = [
  { key: 'systolic', label: 'Presión sistólica', unit: 'mmHg', integer: true },
  { key: 'diastolic', label: 'Presión diastólica', unit: 'mmHg', integer: true },
  { key: 'heart_rate', label: 'Frecuencia cardiaca', unit: 'lpm', integer: true },
  { key: 'resp_rate', label: 'Frecuencia respiratoria', unit: 'rpm', integer: true },
  { key: 'temperature_c', label: 'Temperatura', unit: '°C', integer: false },
  { key: 'spo2', label: 'Saturación de oxígeno', unit: '%', integer: true },
  { key: 'weight_kg', label: 'Peso', unit: 'kg', integer: false },
  { key: 'height_cm', label: 'Talla', unit: 'cm', integer: false },
  { key: 'pain_vas', label: 'Dolor (EVA 0-10)', unit: '/10', integer: true },
]

export type VitalRowValues = { context: VitalContext; measured_at: string } & Record<
  VitalField,
  string
>

export interface DiagnosisValues {
  icd10_code: string
  description: string
  type: DiagnosisType
  is_primary: boolean
  /** true = viene del catálogo (descripción fija); false = escrita a mano porque no está en él. */
  from_catalog: boolean
}

export type VitalsMode = 'single' | 'series'

export interface EncounterFormValues {
  subjective: string
  objective_notes: string
  assessment_notes: string
  plan: string
  followup_at: string
  vitals_not_applicable: boolean
  vitals_not_applicable_reason: string
  history_reviewed: boolean
  vitals_mode: VitalsMode
  vitals: VitalRowValues[]
  diagnoses: DiagnosisValues[]
}

/* ---------- Números ---------- */

const DECIMAL_TEXT = /^\d+([.,]\d+)?$/
const INTEGER_TEXT = /^\d+$/

/** Acepta coma decimal ("36,5"), habitual en Perú. null = no es un número. */
export function parseDecimalText(text: string): number | null {
  const trimmed = text.trim()
  if (!DECIMAL_TEXT.test(trimmed)) return null
  return Number(trimmed.replace(',', '.'))
}

/* ---------- Signos vitales ---------- */

export function emptyVitalRow(context: VitalContext): VitalRowValues {
  return {
    context,
    measured_at: '',
    systolic: '',
    diastolic: '',
    heart_rate: '',
    resp_rate: '',
    temperature_c: '',
    spo2: '',
    weight_kg: '',
    height_cm: '',
    pain_vas: '',
  }
}

const FIELD_ERRORS = {
  number: 'Escriba un número',
  integer: 'Escriba un número entero',
  pair: 'Registre ambas presiones (sistólica y diastólica) o ninguna',
} as const

const numberText = z.string().refine((v) => v.trim() === '' || parseDecimalText(v) !== null, {
  message: FIELD_ERRORS.number,
})

const vitalContextSchema = z.enum(['SINGLE', 'PRE', 'DURING', 'POST'])

export const vitalRowSchema = z
  .object({
    context: vitalContextSchema,
    measured_at: z.string(),
    systolic: numberText,
    diastolic: numberText,
    heart_rate: numberText,
    resp_rate: numberText,
    temperature_c: numberText,
    spo2: numberText,
    weight_kg: numberText,
    height_cm: numberText,
    pain_vas: numberText,
  })
  .superRefine((row, ctx) => {
    for (const spec of VITAL_FIELD_SPECS) {
      const value = row[spec.key].trim()
      if (spec.integer && value !== '' && parseDecimalText(value) !== null) {
        if (!INTEGER_TEXT.test(value)) {
          ctx.addIssue({ code: 'custom', path: [spec.key], message: FIELD_ERRORS.integer })
        }
      }
    }
    const hasSystolic = row.systolic.trim() !== ''
    const hasDiastolic = row.diastolic.trim() !== ''
    if (hasSystolic !== hasDiastolic) {
      ctx.addIssue({
        code: 'custom',
        path: [hasSystolic ? 'diastolic' : 'systolic'],
        message: FIELD_ERRORS.pair,
      })
    }
  })

export interface VitalIssue {
  index: number
  field: VitalField
  message: string
}

export type VitalsBuild = { ok: true; vitals: VitalSignsIn[] } | { ok: false; issues: VitalIssue[] }

function rowHasValues(row: VitalRowValues): boolean {
  return VITAL_FIELD_SPECS.some((spec) => row[spec.key].trim() !== '')
}

function isVitalField(value: unknown): value is VitalField {
  return VITAL_FIELD_SPECS.some((spec) => spec.key === value)
}

/**
 * Convierte las filas escritas en mediciones del API. Las filas vacías se omiten (el servidor
 * rechaza una medición sin valores). NO se envía IMC: el servidor siempre lo calcula.
 */
export function buildVitalsPayload(rows: readonly VitalRowValues[]): VitalsBuild {
  const issues: VitalIssue[] = []
  const vitals: VitalSignsIn[] = []
  rows.forEach((row, index) => {
    const parsed = vitalRowSchema.safeParse(row)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (isVitalField(field)) issues.push({ index, field, message: issue.message })
      }
      return
    }
    if (!rowHasValues(row)) return
    const measurement: VitalSignsIn = { context: row.context }
    if (row.measured_at) measurement.measured_at = row.measured_at
    for (const spec of VITAL_FIELD_SPECS) {
      const number = parseDecimalText(row[spec.key])
      if (number !== null) measurement[spec.key] = number
    }
    vitals.push(measurement)
  })
  return issues.length > 0 ? { ok: false, issues } : { ok: true, vitals }
}

/* ---------- Diagnósticos ---------- */

export interface DiagnosisIssue {
  index: number
  message: string
}

export function diagnosisIssues(rows: readonly DiagnosisValues[]): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = []
  const seen = new Set<string>()
  rows.forEach((row, index) => {
    const code = normalizeIcd10Code(row.icd10_code)
    if (code === null) {
      issues.push({ index, message: `«${row.icd10_code}» no es un código CIE-10 válido` })
      return
    }
    if (seen.has(code)) issues.push({ index, message: `El diagnóstico ${code} está repetido` })
    seen.add(code)
    if (!row.from_catalog && row.description.trim() === '') {
      issues.push({ index, message: `Indique la descripción de ${code}: no está en el catálogo` })
    }
  })
  return issues
}

/** Garantiza exactamente un principal (el primero si ninguno lo es), como exige el servidor. */
export function withSinglePrimary(rows: readonly DiagnosisValues[]): DiagnosisValues[] {
  const firstPrimary = rows.findIndex((row) => row.is_primary)
  return rows.map((row, index) => ({
    ...row,
    is_primary: firstPrimary === -1 ? index === 0 : index === firstPrimary,
  }))
}

export function buildDiagnosesPayload(rows: readonly DiagnosisValues[]): DiagnosisIn[] {
  return withSinglePrimary(rows).map((row) => {
    const diagnosis: DiagnosisIn = {
      icd10_code: normalizeIcd10Code(row.icd10_code) ?? row.icd10_code.trim(),
      type: row.type,
      is_primary: row.is_primary,
    }
    // Siempre se envía la descripción: si el código no está en el catálogo el servidor la exige,
    // y si está, ignora la enviada y usa la oficial.
    const description = row.description.trim()
    if (description !== '') diagnosis.description = description
    return diagnosis
  })
}

/* ---------- Notas SOAP y banderas (grupo «notas») ---------- */

export interface NotesPayload extends Record<string, unknown> {
  subjective: string | null
  objective_notes: string | null
  assessment_notes: string | null
  plan: string | null
  followup_at: string | null
  vitals_not_applicable_reason: string | null
  history_reviewed: boolean
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function buildNotesPayload(values: EncounterFormValues): NotesPayload {
  return {
    subjective: textOrNull(values.subjective),
    objective_notes: textOrNull(values.objective_notes),
    assessment_notes: textOrNull(values.assessment_notes),
    plan: textOrNull(values.plan),
    followup_at: textOrNull(values.followup_at),
    vitals_not_applicable_reason: values.vitals_not_applicable
      ? textOrNull(values.vitals_not_applicable_reason)
      : null,
    history_reviewed: values.history_reviewed,
  }
}

/** Grupos que se guardan por separado: un error en uno no bloquea a los demás. */
export interface VitalsGroupPayload extends Record<string, unknown> {
  vitals: VitalSignsIn[]
}

export interface DiagnosesGroupPayload extends Record<string, unknown> {
  diagnoses: DiagnosisIn[]
}

/** Solo las claves que cambiaron: un PATCH parcial no re-sella lo que el doctor no tocó. */
export function diffPayload<T extends Record<string, unknown>>(
  current: T,
  saved: T,
): Partial<T> | null {
  const changes: Partial<T> = {}
  let changed = false
  for (const key of Object.keys(current) as (keyof T)[]) {
    if (JSON.stringify(current[key]) !== JSON.stringify(saved[key])) {
      changes[key] = current[key]
      changed = true
    }
  }
  return changed ? changes : null
}

/* ---------- Del encuentro del servidor al formulario ---------- */

function toVitalRow(vital: EncounterRead['vitals'][number]): VitalRowValues {
  const row = emptyVitalRow(vital.context)
  // Se conserva la hora original al regrabar la lista (el servidor sustituye todas las mediciones).
  row.measured_at = toIsoInstant(vital.measured_at)
  for (const spec of VITAL_FIELD_SPECS) {
    const value = vital[spec.key]
    row[spec.key] = value === null ? '' : String(value)
  }
  return row
}

export function encounterToFormValues(
  encounter: EncounterRead,
  today: string = todayLimaKey(),
): EncounterFormValues {
  const vitalRows = [...encounter.vitals]
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    .map(toVitalRow)
  const isSeries = vitalRows.length > 1 || vitalRows.some((row) => row.context !== 'SINGLE')
  const reason = encounter.vitals_not_applicable_reason ?? ''
  const reviewedToday =
    encounter.history_reviewed_at !== null && limaDateKeyOf(encounter.history_reviewed_at) === today
  return {
    subjective: encounter.subjective ?? '',
    objective_notes: encounter.objective_notes ?? '',
    assessment_notes: encounter.assessment_notes ?? '',
    plan: encounter.plan ?? '',
    followup_at: encounter.followup_at ?? '',
    vitals_not_applicable: reason.trim() !== '',
    vitals_not_applicable_reason: reason,
    // El checklist exige revisar los antecedentes HOY: una revisión de otro día no cuenta.
    history_reviewed: reviewedToday,
    vitals_mode: isSeries ? 'series' : 'single',
    vitals: vitalRows.length > 0 ? vitalRows : [emptyVitalRow('SINGLE')],
    diagnoses: encounter.diagnoses.map((d) => ({
      icd10_code: d.icd10_code,
      description: d.description,
      type: d.type,
      is_primary: d.is_primary,
      from_catalog: true,
    })),
  }
}
