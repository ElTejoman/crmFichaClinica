import type {
  ClinicalSummary,
  EncounterRead,
  EncounterUpdate,
  PatientRead,
  SigningChecklist,
} from '@/shared/types/aliases'

import { makePatient, makeSummary } from './clinical'
import { installFetch, jsonResponse, type RecordedCall } from './fetchMock'

type Handler = (call: RecordedCall) => Response | undefined

interface ClinicalApiOptions {
  encounter: EncounterRead
  summary?: ClinicalSummary
  patient?: PatientRead
  /** Checklist que devuelve el servidor simulado (por defecto se calcula del borrador). */
  checklist?: (current: EncounterRead) => SigningChecklist
  /** Manejadores adicionales (se consultan primero). */
  extra?: Handler[]
}

/** Calcula un checklist verosímil para pruebas (el real vive en el servidor). */
export function defaultChecklist(e: EncounterRead): SigningChecklist {
  const missing = []
  if (!e.subjective)
    missing.push({ code: 'chief_complaint', message: 'Falta el motivo de consulta (S)' })
  if (e.diagnoses.length === 0)
    missing.push({ code: 'diagnosis', message: 'Falta al menos un diagnóstico CIE-10 (A)' })
  if (!e.plan) missing.push({ code: 'plan', message: 'Falta el plan de tratamiento (P)' })
  if (e.vitals.length === 0 && !e.vitals_not_applicable_reason) {
    missing.push({
      code: 'vitals',
      message: 'Registre signos vitales o indique por qué no aplican',
    })
  }
  if (!e.history_reviewed_at) {
    missing.push({ code: 'history_reviewed', message: 'Confirme que revisó alergias y medicación' })
  }
  return { can_sign: missing.length === 0, missing }
}

/**
 * Servidor clínico simulado y con estado: el PATCH aplica los cambios al encuentro (y calcula
 * el IMC como lo haría el servidor), de modo que el checklist y las lecturas siguientes reflejan
 * lo guardado. Devuelve las llamadas registradas y el estado actual.
 */
export function installClinicalApi(options: ClinicalApiOptions) {
  const state = { encounter: options.encounter }
  const checklist = options.checklist ?? defaultChecklist
  const id = options.encounter.id
  const patientId = options.encounter.patient_id

  const handlers: Handler[] = [
    ...(options.extra ?? []),
    (c) =>
      c.method === 'GET' && c.url === `/api/encounters/${id}`
        ? jsonResponse(200, state.encounter)
        : undefined,
    (c) => {
      if (c.method !== 'PATCH' || c.url !== `/api/encounters/${id}`) return undefined
      const changes = c.body as EncounterUpdate
      const next: EncounterRead = { ...state.encounter }
      if (changes.subjective !== undefined) next.subjective = changes.subjective
      if (changes.objective_notes !== undefined) next.objective_notes = changes.objective_notes
      if (changes.assessment_notes !== undefined) next.assessment_notes = changes.assessment_notes
      if (changes.plan !== undefined) next.plan = changes.plan
      if (changes.vitals_not_applicable_reason !== undefined) {
        next.vitals_not_applicable_reason = changes.vitals_not_applicable_reason
      }
      if (changes.history_reviewed !== undefined) {
        next.history_reviewed_at = changes.history_reviewed ? '2026-11-03T14:00:00Z' : null
      }
      if (changes.vitals) {
        next.vitals = changes.vitals.map((v) => ({
          context: v.context ?? 'SINGLE',
          measured_at: '2026-11-03T14:05:00Z',
          systolic: v.systolic ?? null,
          diastolic: v.diastolic ?? null,
          heart_rate: v.heart_rate ?? null,
          resp_rate: v.resp_rate ?? null,
          temperature_c: v.temperature_c ?? null,
          spo2: v.spo2 ?? null,
          weight_kg: v.weight_kg ?? null,
          height_cm: v.height_cm ?? null,
          pain_vas: v.pain_vas ?? null,
          bmi:
            v.weight_kg && v.height_cm
              ? Math.round((v.weight_kg / (v.height_cm / 100) ** 2) * 10) / 10
              : null,
        }))
      }
      if (changes.diagnoses) {
        next.diagnoses = changes.diagnoses.map((d) => ({
          icd10_code: d.icd10_code,
          description: d.description ?? 'Descripción del catálogo',
          type: d.type ?? 'DEFINITIVE',
          is_primary: d.is_primary ?? false,
        }))
      }
      state.encounter = next
      return jsonResponse(200, next)
    },
    (c) =>
      c.method === 'GET' && c.url === `/api/encounters/${id}/signing-checklist`
        ? jsonResponse(200, checklist(state.encounter))
        : undefined,
    (c) =>
      c.method === 'GET' && c.url === `/api/patients/${patientId}`
        ? jsonResponse(200, options.patient ?? makePatient({ id: patientId }))
        : undefined,
    (c) =>
      c.method === 'GET' && c.url === `/api/patients/${patientId}/clinical-summary`
        ? jsonResponse(200, options.summary ?? makeSummary())
        : undefined,
    (c) =>
      c.method === 'GET' && c.url.startsWith('/api/icd10?')
        ? jsonResponse(200, [{ code: 'M54.5', description: 'Lumbalgia baja' }])
        : undefined,
  ]

  const calls = installFetch(...handlers)
  return {
    calls,
    state,
    patches: () => calls.filter((c) => c.method === 'PATCH' && c.url === `/api/encounters/${id}`),
  }
}
