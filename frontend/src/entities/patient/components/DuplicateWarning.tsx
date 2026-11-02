import { Link } from 'react-router-dom'

import { formatCalendarDate } from '@/shared/lib/dates'
import { DOCUMENT_TYPE_LABELS } from '@/shared/lib/labels'
import type { DuplicateCandidate } from '@/shared/types/aliases'
import { Alert } from '@/shared/ui'

/**
 * Aviso previo al guardado: NO bloquea (puede tratarse de un homónimo), pero evita crear una
 * segunda historia clínica para una persona ya registrada. Los enlaces abren otra pestaña para
 * no perder lo que se está escribiendo.
 */
export function DuplicateWarning({ candidates }: { candidates: readonly DuplicateCandidate[] }) {
  if (candidates.length === 0) return null
  return (
    <Alert tone="warning" title="Posibles pacientes ya registrados">
      <p>Revise si es la misma persona antes de guardar:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {candidates.map((c) => (
          <li key={c.patient_id}>
            <Link
              to={`/pacientes/${c.patient_id}`}
              target="_blank"
              rel="noopener"
              className="font-medium underline"
            >
              {c.full_name}
            </Link>{' '}
            · {DOCUMENT_TYPE_LABELS[c.document_type]} {c.document_number_masked} · nació el{' '}
            {formatCalendarDate(c.birth_date)}
            {c.reasons.length > 0 && <span> ({c.reasons.join('; ')})</span>}
          </li>
        ))}
      </ul>
    </Alert>
  )
}
