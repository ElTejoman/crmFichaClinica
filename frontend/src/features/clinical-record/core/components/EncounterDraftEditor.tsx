import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { FormProvider, useForm, useWatch, type Control } from 'react-hook-form'

import type { ClinicalSummary, EncounterRead, EncounterUpdate } from '@/shared/types/aliases'
import { Alert, CheckboxField, Field, Input, Textarea } from '@/shared/ui'

import { clinicalKeys } from '../api/keys'
import { useUpdateEncounter } from '../api/useEncounters'
import {
  buildDiagnosesPayload,
  buildNotesPayload,
  buildVitalsPayload,
  diagnosisIssues,
  encounterToFormValues,
  type DiagnosesGroupPayload,
  type EncounterFormValues,
  type VitalsGroupPayload,
} from '../encounterForm'
import { combineStatuses, useAutosave } from '../hooks/useAutosave'
import { isNotEditable } from '../serverErrors'
import { ClinicalError } from './ClinicalError'
import { DiagnosesSection } from './DiagnosesSection'
import { SaveIndicator } from './SaveIndicator'
import { SigningPanel } from './SigningPanel'
import { VitalsSection } from './VitalsSection'

const SECTION = 'flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-5'
const SECTION_TITLE = 'text-base font-semibold text-slate-900'

interface EncounterDraftEditorProps {
  encounter: EncounterRead
  /** Alergias y medicación a la vista mientras se documenta (null mientras carga). */
  summary: ClinicalSummary | null
}

/**
 * Editor del borrador. El estado vive en React Hook Form y se guarda SOLO (debounce) en tres
 * grupos independientes —notas, signos vitales y diagnósticos— para que un error en uno (p. ej. un
 * valor fuera de rango) nunca impida guardar lo demás. Cada guardado es un PATCH parcial.
 */
export function EncounterDraftEditor({ encounter, summary }: EncounterDraftEditorProps) {
  const queryClient = useQueryClient()
  const update = useUpdateEncounter(encounter.id)
  // Valores iniciales: se calculan UNA vez; los guardados posteriores no deben reescribir lo que se está tecleando.
  const [initial] = useState(() => encounterToFormValues(encounter))
  const methods = useForm<EncounterFormValues>({ defaultValues: initial })
  const values = useFormValues(methods.control)
  const [baselines] = useState(() => ({
    notes: buildNotesPayload(initial),
    vitals: initialVitals(initial),
    diagnoses: {
      diagnoses: buildDiagnosesPayload(initial.diagnoses),
    } satisfies DiagnosesGroupPayload,
  }))

  const vitalsBuild = buildVitalsPayload(values.vitals)
  const diagnosisProblems = diagnosisIssues(values.diagnoses)
  const save = (changes: EncounterUpdate) => update.mutateAsync(changes)

  const notes = useAutosave({
    payload: buildNotesPayload(values),
    baseline: baselines.notes,
    valid: true,
    enabled: true,
    save,
  })
  const vitals = useAutosave({
    payload: vitalsBuild.ok ? { vitals: vitalsBuild.vitals } : baselines.vitals,
    baseline: baselines.vitals,
    valid: vitalsBuild.ok,
    enabled: true,
    save,
  })
  const diagnoses = useAutosave({
    payload: { diagnoses: buildDiagnosesPayload(values.diagnoses) },
    baseline: baselines.diagnoses,
    valid: diagnosisProblems.length === 0,
    enabled: true,
    save,
  })

  const handles = [notes, vitals, diagnoses]
  const status = combineStatuses(handles.map((h) => h.status))

  async function flushAll(): Promise<boolean> {
    const results = await Promise.all(handles.map((h) => h.flush()))
    return results.every(Boolean)
  }

  const notEditable = handles.some((h) => isNotEditable(h.error))
  const reloadEncounter = () =>
    void queryClient.invalidateQueries({ queryKey: clinicalKeys.encounter(encounter.id) })

  // Avisar al cerrar la pestaña con cambios sin guardar (el navegador pide confirmación).
  const unsaved = status === 'dirty' || status === 'saving' || status === 'error'
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const { register } = methods
  const firstError = handles.find((h) => h.status === 'error')

  return (
    <FormProvider {...methods}>
      <form
        noValidate
        aria-label="Editor del encuentro"
        onSubmit={(event) => event.preventDefault()}
        className="grid gap-5 xl:grid-cols-[1fr_20rem] xl:items-start"
      >
        <div className="flex flex-col gap-5">
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white/95 px-4 py-2 shadow-sm">
            <SaveIndicator
              status={status}
              {...(firstError ? { onRetry: () => void flushAll() } : {})}
            />
            <a
              href="#firma"
              className="text-sm font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              Ir a requisitos de firma
            </a>
          </div>
          {notEditable && (
            <Alert tone="error" title="El encuentro ya no es un borrador">
              Se firmó desde otra ventana, así que no admite más cambios.{' '}
              <button type="button" onClick={reloadEncounter} className="font-medium underline">
                Recargar
              </button>
            </Alert>
          )}
          {notes.error !== null && !notEditable && <ClinicalError error={notes.error} />}

          <section aria-labelledby="review-title" className={SECTION}>
            <h3 id="review-title" className={SECTION_TITLE}>
              Revisión de antecedentes
            </h3>
            <ReviewSummary summary={summary} />
            <CheckboxField
              label="Revisé las alergias y la medicación del paciente en esta atención"
              hint="Es obligatorio para firmar y debe ser de hoy."
              {...register('history_reviewed')}
            />
          </section>

          <section aria-labelledby="soap-s-title" className={SECTION}>
            <h3 id="soap-s-title" className={SECTION_TITLE}>
              Subjetivo (S)
            </h3>
            <Field label="Motivo de consulta y relato del paciente" required>
              {(c) => <Textarea {...c} rows={4} {...register('subjective')} />}
            </Field>
          </section>

          <section aria-labelledby="soap-o-title" className={SECTION}>
            <h3 id="soap-o-title" className={SECTION_TITLE}>
              Objetivo (O)
            </h3>
            <Field label="Examen físico y hallazgos">
              {(c) => <Textarea {...c} rows={4} {...register('objective_notes')} />}
            </Field>
            <VitalsSection
              issues={vitalsBuild.ok ? [] : vitalsBuild.issues}
              savedVitals={encounter.vitals}
              saveError={vitals.error}
            />
          </section>

          <section aria-labelledby="soap-a-title" className={SECTION}>
            <h3 id="soap-a-title" className={SECTION_TITLE}>
              Evaluación (A)
            </h3>
            <Field label="Evaluación clínica">
              {(c) => <Textarea {...c} rows={3} {...register('assessment_notes')} />}
            </Field>
            <DiagnosesSection
              value={values.diagnoses}
              onChange={(next) => methods.setValue('diagnoses', next, { shouldDirty: true })}
              saveError={diagnoses.error}
            />
          </section>

          <section aria-labelledby="soap-p-title" className={SECTION}>
            <h3 id="soap-p-title" className={SECTION_TITLE}>
              Plan (P)
            </h3>
            <Field label="Plan de tratamiento" required>
              {(c) => <Textarea {...c} rows={4} {...register('plan')} />}
            </Field>
            <Field label="Próximo control">
              {(c) => <Input type="date" {...c} {...register('followup_at')} />}
            </Field>
          </section>

          {encounter.payload === null && (
            <p className="text-sm text-slate-600">
              El módulo de esta especialidad se habilita en una fase posterior.
            </p>
          )}
        </div>

        <aside className="xl:sticky xl:top-4">
          <SigningPanel
            encounterId={encounter.id}
            saveStatus={status}
            hasInvalidFields={!vitalsBuild.ok || diagnosisProblems.length > 0}
            flushAll={flushAll}
            onNotEditable={reloadEncounter}
          />
        </aside>
      </form>
    </FormProvider>
  )
}

function initialVitals(values: EncounterFormValues): VitalsGroupPayload {
  const build = buildVitalsPayload(values.vitals)
  return { vitals: build.ok ? build.vitals : [] }
}

function ReviewSummary({ summary }: { summary: ClinicalSummary | null }) {
  if (!summary) return null
  const allergies = summary.allergies.map((a) => a.substance)
  const medications = summary.medications.map((m) => m.name)
  return (
    <dl className="grid gap-1 text-sm md:grid-cols-[8rem_1fr]">
      <dt className="text-slate-600">Alergias</dt>
      <dd className="text-slate-900">
        {allergies.length > 0 ? allergies.join(', ') : 'Ninguna registrada'}
      </dd>
      <dt className="text-slate-600">Medicación</dt>
      <dd className="text-slate-900">
        {medications.length > 0 ? medications.join(', ') : 'Ninguna registrada'}
      </dd>
    </dl>
  )
}

/** Los valores del formulario completos y bien tipados (`useWatch` sin nombre los devuelve parciales). */
function useFormValues(control: Control<EncounterFormValues>): EncounterFormValues {
  const [
    subjective,
    objective_notes,
    assessment_notes,
    plan,
    followup_at,
    vitals_not_applicable,
    vitals_not_applicable_reason,
    history_reviewed,
    vitals_mode,
    vitals,
    diagnoses,
  ] = useWatch({
    control,
    name: [
      'subjective',
      'objective_notes',
      'assessment_notes',
      'plan',
      'followup_at',
      'vitals_not_applicable',
      'vitals_not_applicable_reason',
      'history_reviewed',
      'vitals_mode',
      'vitals',
      'diagnoses',
    ],
  })
  return {
    subjective,
    objective_notes,
    assessment_notes,
    plan,
    followup_at,
    vitals_not_applicable,
    vitals_not_applicable_reason,
    history_reviewed,
    vitals_mode,
    vitals,
    diagnoses,
  }
}
