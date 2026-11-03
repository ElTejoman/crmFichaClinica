import { makeEncounter, makeVital } from '@/test/clinical'

import {
  buildDiagnosesPayload,
  buildNotesPayload,
  buildVitalsPayload,
  diagnosisIssues,
  diffPayload,
  emptyVitalRow,
  encounterToFormValues,
  parseDecimalText,
  withSinglePrimary,
  type DiagnosisValues,
  type VitalRowValues,
} from './encounterForm'

const TODAY = '2026-11-03'

function row(overrides: Partial<VitalRowValues> = {}): VitalRowValues {
  return { ...emptyVitalRow('SINGLE'), ...overrides }
}

function dx(code: string, overrides: Partial<DiagnosisValues> = {}): DiagnosisValues {
  return {
    icd10_code: code,
    description: 'Algo',
    type: 'DEFINITIVE',
    is_primary: false,
    from_catalog: true,
    ...overrides,
  }
}

describe('parseDecimalText', () => {
  it('acepta coma o punto decimal y rechaza lo demás', () => {
    expect(parseDecimalText('36,5')).toBe(36.5)
    expect(parseDecimalText(' 70 ')).toBe(70)
    expect(parseDecimalText('')).toBeNull()
    expect(parseDecimalText('abc')).toBeNull()
    expect(parseDecimalText('-5')).toBeNull()
    expect(parseDecimalText('1e3')).toBeNull()
  })
})

describe('buildVitalsPayload', () => {
  it('convierte texto a números y NUNCA incluye el IMC (lo calcula el servidor)', () => {
    const result = buildVitalsPayload([
      row({ systolic: '120', diastolic: '80', weight_kg: '70,5', height_cm: '170' }),
    ])
    expect(result).toEqual({
      ok: true,
      vitals: [
        { context: 'SINGLE', systolic: 120, diastolic: 80, weight_kg: 70.5, height_cm: 170 },
      ],
    })
    if (result.ok) expect(Object.keys(result.vitals[0] ?? {})).not.toContain('bmi')
  })

  it('omite las filas vacías (el servidor rechaza una medición sin valores)', () => {
    const result = buildVitalsPayload([row(), row({ context: 'POST', heart_rate: '70' })])
    expect(result).toEqual({ ok: true, vitals: [{ context: 'POST', heart_rate: 70 }] })
  })

  it('conserva la hora original de la medición al regrabar la lista', () => {
    const result = buildVitalsPayload([
      row({ heart_rate: '70', measured_at: '2026-11-03T14:05:00.000Z' }),
    ])
    expect(result).toEqual({
      ok: true,
      vitals: [{ context: 'SINGLE', measured_at: '2026-11-03T14:05:00.000Z', heart_rate: 70 }],
    })
  })

  it('marca el campo y el motivo cuando no es un número o debe ser entero', () => {
    const result = buildVitalsPayload([row({ heart_rate: '7x', spo2: '97,5' })])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          { index: 0, field: 'heart_rate', message: 'Escriba un número' },
          { index: 0, field: 'spo2', message: 'Escriba un número entero' },
        ]),
      )
    }
  })

  it('exige ambas presiones o ninguna', () => {
    const result = buildVitalsPayload([row({ systolic: '120' })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toMatchObject({ field: 'diastolic' })
  })
})

describe('diagnósticos', () => {
  it('detecta códigos inválidos, repetidos y descripciones manuales vacías', () => {
    const issues = diagnosisIssues([
      dx('M54.5'),
      dx('m545'),
      dx('xx'),
      dx('K02.1', { from_catalog: false, description: ' ' }),
    ])
    const messages = issues.map((i) => i.message)
    expect(messages).toEqual(
      expect.arrayContaining([
        'El diagnóstico M54.5 está repetido',
        '«xx» no es un código CIE-10 válido',
        'Indique la descripción de K02.1: no está en el catálogo',
      ]),
    )
  })

  it('garantiza exactamente un principal (el primero si ninguno lo es)', () => {
    const rows = withSinglePrimary([dx('M54.5'), dx('K02.1')])
    expect(rows.map((r) => r.is_primary)).toEqual([true, false])
    const two = withSinglePrimary([
      dx('M54.5', { is_primary: true }),
      dx('K02.1', { is_primary: true }),
    ])
    expect(two.map((r) => r.is_primary)).toEqual([true, false])
  })

  it('envía el código normalizado y la descripción', () => {
    expect(buildDiagnosesPayload([dx('m545', { description: ' Lumbalgia ' })])).toEqual([
      { icd10_code: 'M54.5', description: 'Lumbalgia', type: 'DEFINITIVE', is_primary: true },
    ])
  })
})

describe('notas y diff', () => {
  it('los textos vacíos o en blanco viajan como null; "no aplica" sin marcar anula el motivo', () => {
    const values = encounterToFormValues(makeEncounter(), TODAY)
    const payload = buildNotesPayload({
      ...values,
      subjective: '   ',
      plan: ' Reposo ',
      vitals_not_applicable: false,
      vitals_not_applicable_reason: 'ignorado',
    })
    expect(payload).toMatchObject({
      subjective: null,
      plan: 'Reposo',
      vitals_not_applicable_reason: null,
    })
  })

  it('diffPayload devuelve solo las claves que cambiaron (o null si nada cambió)', () => {
    const saved = { a: 'x', b: 'y', c: false }
    expect(diffPayload({ a: 'x', b: 'y', c: false }, saved)).toBeNull()
    expect(diffPayload({ a: 'x', b: 'z', c: true }, saved)).toEqual({ b: 'z', c: true })
  })
})

describe('encounterToFormValues', () => {
  it('"antecedentes revisados" solo cuenta si la revisión es de HOY en Lima', () => {
    const today = encounterToFormValues(
      makeEncounter({ history_reviewed_at: '2026-11-03T14:00:00Z' }),
      TODAY,
    )
    const yesterday = encounterToFormValues(
      makeEncounter({ history_reviewed_at: '2026-11-02T14:00:00Z' }),
      TODAY,
    )
    expect(today.history_reviewed).toBe(true)
    expect(yesterday.history_reviewed).toBe(false)
  })

  it('usa la fecha de Lima y no la del dispositivo (02:00Z del 4-nov es todavía 3-nov en Lima)', () => {
    const values = encounterToFormValues(
      makeEncounter({ history_reviewed_at: '2026-11-04T02:00:00Z' }),
      TODAY,
    )
    expect(values.history_reviewed).toBe(true)
  })

  it('detecta la serie PRE/POST y una medición única', () => {
    const single = encounterToFormValues(makeEncounter({ vitals: [makeVital()] }), TODAY)
    const series = encounterToFormValues(
      makeEncounter({
        vitals: [
          makeVital({ context: 'POST', measured_at: '2026-11-03T15:00:00Z' }),
          makeVital({ context: 'PRE', measured_at: '2026-11-03T14:00:00Z' }),
        ],
      }),
      TODAY,
    )
    expect(single.vitals_mode).toBe('single')
    expect(series.vitals_mode).toBe('series')
    expect(series.vitals.map((r) => r.context)).toEqual(['PRE', 'POST'])
  })

  it('el motivo de "no aplica" marca la casilla y siempre hay al menos una fila de vitales', () => {
    const values = encounterToFormValues(
      makeEncounter({ vitals_not_applicable_reason: 'Control telefónico' }),
      TODAY,
    )
    expect(values.vitals_not_applicable).toBe(true)
    expect(values.vitals).toHaveLength(1)
  })
})
