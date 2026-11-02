import type { ReactNode } from 'react'

import { formatCalendarDate, formatDateTimeLima } from '@/shared/lib/dates'
import {
  DOCUMENT_TYPE_LABELS,
  LEAD_SOURCE_LABELS,
  MARITAL_STATUS_LABELS,
  SEX_LABELS,
} from '@/shared/lib/labels'
import type { PatientRead } from '@/shared/types/aliases'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-5">
      <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-600 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children || '—'}</dd>
    </div>
  )
}

/** Ficha administrativa de solo lectura (sin contenido clínico). */
export function PatientDataView({ patient }: { patient: PatientRead }) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="Identificación">
        <Item label="Documento">
          {DOCUMENT_TYPE_LABELS[patient.document_type]} {patient.document_number}
        </Item>
        <Item label="Fecha de nacimiento">{formatCalendarDate(patient.birth_date)}</Item>
        <Item label="Edad">
          {patient.age} {patient.age === 1 ? 'año' : 'años'}
          {patient.is_minor ? ' · menor de edad' : ''}
        </Item>
        <Item label="Sexo">{SEX_LABELS[patient.sex]}</Item>
        <Item label="Estado civil">
          {patient.marital_status ? MARITAL_STATUS_LABELS[patient.marital_status] : null}
        </Item>
        <Item label="Ocupación">{patient.occupation}</Item>
      </Section>

      <Section title="Contacto">
        <Item label="Teléfono">{patient.phone}</Item>
        <Item label="Correo">{patient.email}</Item>
        <Item label="Dirección">{patient.address}</Item>
        <Item label="Distrito">{patient.district}</Item>
        <Item label="Seguro">{patient.insurance}</Item>
        <Item label="¿Cómo nos conoció?">
          {patient.referral_source ? LEAD_SOURCE_LABELS[patient.referral_source] : null}
        </Item>
      </Section>

      {patient.guardian && (
        <Section title="Apoderado">
          <Item label="Nombre">{patient.guardian.name}</Item>
          <Item label="Parentesco">{patient.guardian.relation}</Item>
          <Item label="Documento">
            {DOCUMENT_TYPE_LABELS[patient.guardian.document_type]}{' '}
            {patient.guardian.document_number}
          </Item>
          <Item label="Teléfono">{patient.guardian.phone}</Item>
        </Section>
      )}

      {patient.emergency_contact && (
        <Section title="Contacto de emergencia">
          <Item label="Nombre">{patient.emergency_contact.name}</Item>
          <Item label="Teléfono">{patient.emergency_contact.phone}</Item>
          <Item label="Parentesco">{patient.emergency_contact.relation}</Item>
        </Section>
      )}

      <Section title="Consentimiento de datos personales">
        <Item label="Otorgado el">{formatDateTimeLima(patient.data_processing_consent_at)}</Item>
      </Section>
    </div>
  )
}
