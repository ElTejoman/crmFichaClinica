import { formatShortDateTimeLima } from '@/shared/lib/dates'
import type { AllergySeverity, ClinicalSummary } from '@/shared/types/aliases'
import { Badge, type BadgeTone } from '@/shared/ui'

import { ALLERGY_SEVERITY_LABELS, CONDITION_KIND_LABELS } from '../labels'

const SEVERITY_TONE: Record<AllergySeverity, BadgeTone> = {
  SEVERE: 'danger',
  MODERATE: 'warning',
  MILD: 'neutral',
}

interface ClinicalAlertsBannerProps {
  summary: ClinicalSummary
  /** Lleva al formulario de consentimientos cuando falta el general. */
  onGoToConsents?: () => void
  /** Versión compacta (encabezado del editor): solo alergias y consentimiento. */
  compact?: boolean
}

/**
 * Lo primero que ve el doctor: alergias activas (en rojo y con la gravedad escrita, no solo con
 * color), medicación, antecedentes y si el paciente tiene consentimiento general vigente. Sin
 * ese consentimiento el servidor bloquea la firma, así que el aviso es visible desde el inicio.
 */
export function ClinicalAlertsBanner({
  summary,
  onGoToConsents,
  compact,
}: ClinicalAlertsBannerProps) {
  const { allergies, medications, conditions, consents } = summary
  const hasSevere = allergies.some((a) => a.severity === 'SEVERE')
  return (
    <section aria-label="Alertas clínicas" className="flex flex-col gap-3">
      <div
        className={`rounded-lg border-2 p-4 ${
          allergies.length > 0 ? 'border-red-600 bg-red-50' : 'border-slate-300 bg-white'
        }`}
      >
        <h3
          className={`text-sm font-semibold ${allergies.length > 0 ? 'text-red-900' : 'text-slate-800'}`}
        >
          {allergies.length > 0 ? (
            <>
              <span aria-hidden="true">⚠ </span>Alergias activas
              {hasSevere && ' (incluye alergia grave)'}
            </>
          ) : (
            'Alergias'
          )}
        </h3>
        {allergies.length === 0 ? (
          <p className="mt-1 text-sm text-slate-700">
            No hay alergias registradas. Confirme con el paciente antes de indicar tratamiento.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {allergies.map((allergy) => (
              <li key={allergy.id} className="flex flex-wrap items-center gap-2 text-sm">
                <strong className="text-red-950">{allergy.substance}</strong>
                <Badge tone={SEVERITY_TONE[allergy.severity]} icon="⚠">
                  {ALLERGY_SEVERITY_LABELS[allergy.severity]}
                </Badge>
                {allergy.reaction && <span className="text-red-950">{allergy.reaction}</span>}
                {allergy.verified_at === null && (
                  <span className="text-xs text-red-900">(sin verificar)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!consents.general_care && (
        <div
          role="alert"
          className="rounded-md border-2 border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-semibold">
            <span aria-hidden="true">⚠ </span>Sin consentimiento general vigente
          </p>
          <p>
            No se podrá firmar ningún encuentro hasta registrar el consentimiento de atención
            general.{' '}
            {onGoToConsents && (
              <button
                type="button"
                onClick={onGoToConsents}
                className="font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                Ir a Consentimientos
              </button>
            )}
          </p>
        </div>
      )}
      {!consents.data_processing && !compact && (
        <p className="text-sm text-amber-900">
          <span aria-hidden="true">⚠ </span>Falta el consentimiento de tratamiento de datos
          personales.
        </p>
      )}

      {!compact && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-300 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">
              Medicación actual ({medications.length})
            </h3>
            {medications.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">Sin medicación registrada.</p>
            ) : (
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-800">
                {medications.map((m) => (
                  <li key={m.id}>
                    {m.name}
                    {m.dose && ` · ${m.dose}`}
                    {m.frequency && ` · ${m.frequency}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-slate-300 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">
              Antecedentes ({conditions.length})
            </h3>
            {conditions.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">Sin antecedentes registrados.</p>
            ) : (
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-800">
                {conditions.map((c) => (
                  <li key={c.id}>
                    <span className="text-slate-600">{CONDITION_KIND_LABELS[c.kind]}:</span>{' '}
                    {c.description}
                    {c.icd10_code && ` (${c.icd10_code})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!compact && (
        <p className="text-sm text-slate-700">
          {summary.signed_encounters}{' '}
          {summary.signed_encounters === 1 ? 'encuentro firmado' : 'encuentros firmados'}
          {' · '}
          {summary.last_encounter_at
            ? `Último encuentro: ${formatShortDateTimeLima(summary.last_encounter_at)} (hora de Lima)`
            : 'Aún no hay encuentros firmados'}
        </p>
      )}
    </section>
  )
}
