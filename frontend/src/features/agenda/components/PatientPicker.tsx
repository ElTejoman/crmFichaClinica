import { useState } from 'react'

import { usePatientLookup } from '@/entities/patient'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { Button, Field, Input, Spinner } from '@/shared/ui'

const SEARCH_DEBOUNCE_MS = 300

export interface PickedPatient {
  id: string
  name: string
  detail: string
}

interface PatientPickerProps {
  value: PickedPatient | null
  onChange: (patient: PickedPatient | null) => void
}

/** Buscador de pacientes con debounce (nombre sin tildes, documento o teléfono). */
export function PatientPicker({ value, onChange }: PatientPickerProps) {
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS)
  const results = usePatientLookup(q)

  if (value) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-300 bg-slate-50 p-3">
        <p className="text-sm">
          <span className="font-medium text-slate-900">{value.name}</span>
          {value.detail && <span className="text-slate-600"> · {value.detail}</span>}
        </p>
        <Button variant="secondary" onClick={() => onChange(null)}>
          Cambiar paciente
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Field
        label="Buscar paciente"
        hint="Por nombre (sin importar tildes), documento o teléfono."
        required
      >
        {(c) => (
          <Input
            type="search"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            {...c}
          />
        )}
      </Field>
      {q.length >= 2 && results.isFetching && (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
          <Spinner /> Buscando…
        </p>
      )}
      {q.length >= 2 && results.data && (
        <div aria-live="polite">
          {results.data.length === 0 ? (
            <p className="text-sm text-slate-600">No se encontraron pacientes con esa búsqueda.</p>
          ) : (
            <ul
              aria-label="Resultados de pacientes"
              className="divide-y divide-slate-200 rounded-md border border-slate-300"
            >
              {results.data.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        id: patient.id,
                        name: patient.full_name,
                        detail: patient.hc_code ?? '',
                      })
                    }
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700"
                  >
                    <span className="font-medium text-slate-900">{patient.full_name}</span>
                    <span className="text-slate-600">
                      {patient.hc_code ?? ''} {patient.phone ? `· ${patient.phone}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
