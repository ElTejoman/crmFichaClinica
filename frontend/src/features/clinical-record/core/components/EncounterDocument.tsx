import { formatCalendarDate, formatDateTimeLima, formatShortDateTimeLima } from '@/shared/lib/dates'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { EncounterRead } from '@/shared/types/aliases'

import { DIAGNOSIS_TYPE_LABELS, VITAL_CONTEXT_LABELS, VITAL_CONTEXT_ORDER } from '../labels'
import { describeVitals } from '../vitalsFormat'
import { EncounterStatusBadge } from './EncounterStatusBadge'

function TextBlock({ title, text }: { title: string; text: string | null }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      {text ? (
        <p className="text-sm whitespace-pre-wrap text-slate-900">{text}</p>
      ) : (
        <p className="text-sm text-slate-500">No registrado.</p>
      )}
    </section>
  )
}

/**
 * Contenido del encuentro SOLO LECTURA (firmado/enmendado, o borrador ajeno). Es el mismo
 * componente que se imprime: el texto del paciente va como texto (nunca como HTML).
 */
export function EncounterDocument({ encounter }: { encounter: EncounterRead }) {
  const vitals = [...encounter.vitals].sort(
    (a, b) => VITAL_CONTEXT_ORDER.indexOf(a.context) - VITAL_CONTEXT_ORDER.indexOf(b.context),
  )
  return (
    <article aria-label="Contenido del encuentro" className="flex flex-col gap-5">
      <dl className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-[10rem_1fr]">
        <dt className="text-slate-600">Especialidad</dt>
        <dd className="text-slate-900">{SPECIALTY_LABELS[encounter.specialty]}</dd>
        <dt className="text-slate-600">Doctor/a</dt>
        <dd className="text-slate-900">{encounter.doctor_name}</dd>
        <dt className="text-slate-600">Fecha de atención</dt>
        <dd className="text-slate-900">
          {formatShortDateTimeLima(encounter.occurred_at)} (hora de Lima)
        </dd>
        <dt className="text-slate-600">Estado</dt>
        <dd>
          <EncounterStatusBadge status={encounter.status} />
        </dd>
      </dl>

      <TextBlock title="Subjetivo (S): motivo de consulta" text={encounter.subjective} />
      <TextBlock title="Objetivo (O): examen físico" text={encounter.objective_notes} />

      <section className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-slate-800">Signos vitales</h4>
        {vitals.length === 0 ? (
          <p className="text-sm text-slate-700">
            {encounter.vitals_not_applicable_reason
              ? `No aplican en esta atención: ${encounter.vitals_not_applicable_reason}`
              : 'No registrados.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {vitals.map((vital, index) => (
              <li key={`${vital.context}-${index}`} className="text-sm text-slate-900">
                <span className="font-medium">{VITAL_CONTEXT_LABELS[vital.context]}</span>
                <ul className="list-disc pl-5">
                  {describeVitals(vital).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TextBlock title="Evaluación (A)" text={encounter.assessment_notes} />
      <section className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-slate-800">Diagnósticos CIE-10</h4>
        {encounter.diagnoses.length === 0 ? (
          <p className="text-sm text-slate-500">Sin diagnósticos.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm text-slate-900">
            {encounter.diagnoses.map((d) => (
              <li key={d.icd10_code}>
                <strong>{d.icd10_code}</strong> — {d.description} ({DIAGNOSIS_TYPE_LABELS[d.type]}
                {d.is_primary ? ', principal' : ''})
              </li>
            ))}
          </ul>
        )}
      </section>

      <TextBlock title="Plan (P)" text={encounter.plan} />
      {encounter.followup_at && (
        <p className="text-sm text-slate-900">
          <span className="font-semibold text-slate-800">Próximo control: </span>
          {formatCalendarDate(encounter.followup_at)}
        </p>
      )}

      {encounter.signed_at && (
        <section
          aria-label="Firma del encuentro"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-950"
        >
          <p className="font-semibold">Firmado electrónicamente</p>
          <p>
            {encounter.signer_name ?? 'Firmante no registrado'}
            {' · '}
            {encounter.signer_license ?? 'Colegiatura no registrada'}
          </p>
          <p>{formatDateTimeLima(encounter.signed_at)} (hora de Lima)</p>
        </section>
      )}

      {encounter.addenda.length > 0 && (
        <section aria-labelledby={`addenda-${encounter.id}`} className="flex flex-col gap-2">
          <h4 id={`addenda-${encounter.id}`} className="text-sm font-semibold text-slate-800">
            Adendas ({encounter.addenda.length})
          </h4>
          <ol className="flex flex-col gap-2">
            {encounter.addenda.map((addendum) => (
              <li
                key={addendum.id}
                className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm"
              >
                <p className="font-medium text-slate-900">{addendum.reason}</p>
                <p className="whitespace-pre-wrap text-slate-900">{addendum.text}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {addendum.author_name}
                  {addendum.author_license && ` · ${addendum.author_license}`}
                  {' · '}
                  {formatDateTimeLima(addendum.created_at)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  )
}
