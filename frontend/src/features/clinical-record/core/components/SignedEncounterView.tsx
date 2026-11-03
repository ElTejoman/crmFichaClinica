import { useState } from 'react'

import type { EncounterRead } from '@/shared/types/aliases'
import { Alert, Button } from '@/shared/ui'

import { AddendumDialog } from './AddendumDialog'
import { EncounterDocument } from './EncounterDocument'
import { EncounterIntegrityCheck } from './EncounterIntegrityCheck'

interface SignedEncounterViewProps {
  encounter: EncounterRead
  /** Solo el autor (con `clinical:write`) añade adendas. */
  canAmend: boolean
}

/** Vista de solo lectura de un encuentro firmado o enmendado: sin campos editables. */
export function SignedEncounterView({ encounter, canAmend }: SignedEncounterViewProps) {
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const isDraft = encounter.status === 'DRAFT'

  return (
    <div className="flex flex-col gap-5">
      <div data-no-print className="flex flex-col gap-5">
        {isDraft ? (
          <Alert tone="info">
            Este encuentro es un borrador: solo lo puede editar su autor, con permiso de escritura
            clínica.
          </Alert>
        ) : (
          <Alert tone="info">
            Encuentro firmado: es de solo lectura. Para corregir o ampliar algo se añade una adenda.
          </Alert>
        )}
        <div aria-live="polite" className="empty:hidden">
          {message && <Alert tone="success">{message}</Alert>}
        </div>
      </div>
      {!isDraft && (
        <div className="flex flex-wrap items-start gap-3" data-no-print>
          {canAmend ? (
            <Button onClick={() => setAdding(true)}>Adenda</Button>
          ) : (
            <p className="text-sm text-slate-600">Solo el autor puede añadir adendas.</p>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimir
          </Button>
        </div>
      )}
      <div className="rounded-xl border border-slate-300 bg-white p-5">
        <EncounterDocument encounter={encounter} />
      </div>
      {!isDraft && <EncounterIntegrityCheck encounterId={encounter.id} />}
      <AddendumDialog
        open={adding}
        onClose={() => setAdding(false)}
        encounterId={encounter.id}
        onAdded={() => setMessage('Adenda registrada.')}
      />
    </div>
  )
}
