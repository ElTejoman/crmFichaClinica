import { useState } from 'react'
import { Link } from 'react-router-dom'

import { formatShortDateTimeLima } from '@/shared/lib/dates'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { Specialty } from '@/shared/types/aliases'
import { Button, Pagination, Spinner, Table, Td, Th } from '@/shared/ui'

import { useEncounterTimeline } from '../api/useEncounters'
import { encounterPath } from '../paths'
import { ClinicalError } from './ClinicalError'
import { EncounterStatusBadge } from './EncounterStatusBadge'
import { NewEncounterDialog } from './NewEncounterDialog'

const LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

interface EncounterTimelineProps {
  patientId: string
  /** Solo el doctor crea encuentros (`clinical:write`). */
  canCreate: boolean
  /** Especialidades del doctor que mira. */
  specialties: readonly Specialty[]
}

/** Línea de tiempo de encuentros: más reciente primero, paginada, hora de Lima. */
export function EncounterTimeline({ patientId, canCreate, specialties }: EncounterTimelineProps) {
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const timeline = useEncounterTimeline(patientId, page)

  return (
    <section
      aria-labelledby="timeline-title"
      className="flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="timeline-title" className="text-lg font-semibold text-slate-900">
          Encuentros
        </h3>
        {canCreate && <Button onClick={() => setCreating(true)}>Nuevo encuentro</Button>}
      </div>
      {timeline.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando encuentros…
        </p>
      )}
      {timeline.isError && <ClinicalError error={timeline.error} />}
      {timeline.data &&
        (timeline.data.encounters.length === 0 ? (
          <p className="text-sm text-slate-600">
            {page === 0 ? 'Aún no hay encuentros registrados.' : 'No hay más encuentros.'}
          </p>
        ) : (
          <>
            <Table caption="Línea de tiempo de encuentros clínicos, del más reciente al más antiguo">
              <thead>
                <tr>
                  <Th>Fecha (hora de Lima)</Th>
                  <Th>Especialidad</Th>
                  <Th>Doctor</Th>
                  <Th>Estado</Th>
                  <Th>Diagnóstico principal</Th>
                  <Th>Adendas</Th>
                </tr>
              </thead>
              <tbody>
                {timeline.data.encounters.map((encounter) => (
                  <tr key={encounter.id}>
                    <Td>
                      <Link to={encounterPath(patientId, encounter.id)} className={LINK}>
                        {formatShortDateTimeLima(encounter.occurred_at)}
                        <span className="sr-only">
                          , abrir encuentro de {SPECIALTY_LABELS[encounter.specialty]}
                        </span>
                      </Link>
                    </Td>
                    <Td>{SPECIALTY_LABELS[encounter.specialty]}</Td>
                    <Td>{encounter.doctor_name}</Td>
                    <Td>
                      <EncounterStatusBadge status={encounter.status} />
                    </Td>
                    <Td>
                      {encounter.primary_diagnosis_code ? (
                        <>
                          <span className="font-medium">{encounter.primary_diagnosis_code}</span>
                          {encounter.primary_diagnosis_text &&
                            ` · ${encounter.primary_diagnosis_text}`}
                        </>
                      ) : (
                        <span className="text-slate-500">Sin diagnóstico</span>
                      )}
                    </Td>
                    <Td>{encounter.addenda_count}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              hasNext={timeline.data.hasNext}
              onPageChange={setPage}
              disabled={timeline.isFetching}
            />
          </>
        ))}
      <NewEncounterDialog
        open={creating}
        onClose={() => setCreating(false)}
        patientId={patientId}
        specialties={specialties}
      />
    </section>
  )
}
