import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { ApiError } from '@/shared/lib/http'
import { DOCUMENT_TYPE_LABELS } from '@/shared/lib/labels'
import {
  Alert,
  Badge,
  CheckboxField,
  Field,
  Input,
  Pagination,
  Spinner,
  Table,
  Td,
  Th,
} from '@/shared/ui'

import { usePatientSearch } from '../api/usePatients'

const SEARCH_DEBOUNCE_MS = 300
const FOCUS_LINK =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/** Buscador + tabla de pacientes. El servidor ya limita al doctor a su cartera. */
export function PatientsList({ canManage }: { canManage: boolean }) {
  const [text, setText] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [page, setPage] = useState(0)
  const q = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS)
  const patients = usePatientSearch({ q, includeInactive, page })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Pacientes</h1>
        {canManage && (
          <Link
            to="/pacientes/nuevo"
            className={`inline-flex min-h-10 items-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 ${FOCUS_LINK}`}
          >
            Nuevo paciente
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="w-full max-w-md">
          <Field
            label="Buscar paciente"
            hint="Por nombre (sin importar tildes), documento o teléfono."
          >
            {(c) => (
              <Input
                type="search"
                autoComplete="off"
                placeholder="Ej.: maria gomez, 4512…, 9123…"
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setPage(0)
                }}
                {...c}
              />
            )}
          </Field>
        </div>
        <div className="pb-1.5">
          <CheckboxField
            label="Incluir archivados"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked)
              setPage(0)
            }}
          />
        </div>
      </div>

      {patients.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando pacientes…
        </p>
      )}
      {patients.isError && (
        <Alert tone="error">
          {patients.error instanceof ApiError
            ? patients.error.message
            : 'No se pudo cargar la lista de pacientes.'}
        </Alert>
      )}
      {patients.data && (
        <>
          {patients.data.patients.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
              {q
                ? 'No se encontraron pacientes con esa búsqueda.'
                : 'No hay pacientes para mostrar.'}
            </p>
          ) : (
            <Table caption="Pacientes">
              <thead>
                <tr>
                  <Th>HC</Th>
                  <Th>Paciente</Th>
                  <Th>Documento</Th>
                  <Th>Edad</Th>
                  <Th>Teléfono</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {patients.data.patients.map((patient) => (
                  <tr key={patient.id}>
                    <Td className="font-mono text-xs whitespace-nowrap">
                      {patient.hc_code ?? '—'}
                    </Td>
                    <Td>
                      <Link
                        to={`/pacientes/${patient.id}`}
                        className={`font-medium text-brand-700 underline ${FOCUS_LINK}`}
                      >
                        {patient.full_name}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {DOCUMENT_TYPE_LABELS[patient.document_type]} {patient.document_number}
                    </Td>
                    <Td>{patient.age} años</Td>
                    <Td className="whitespace-nowrap">{patient.phone ?? '—'}</Td>
                    <Td>
                      {patient.is_active ? (
                        <Badge tone="success" icon="●">
                          Activo
                        </Badge>
                      ) : (
                        <Badge tone="neutral" icon="○">
                          Archivado
                        </Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination
            page={page}
            hasNext={patients.data.hasNext}
            onPageChange={setPage}
            disabled={patients.isFetching}
          />
        </>
      )}
    </div>
  )
}
