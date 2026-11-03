import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Alert, Button, Dialog, Spinner } from '@/shared/ui'

import { clinicalKeys } from '../api/keys'
import { useSignEncounter, useSigningChecklist } from '../api/useEncounters'
import type { AutosaveStatus } from '../hooks/useAutosave'
import {
  describeClinicalError,
  isNotEditable,
  signingBlockedItems,
  type MissingRequirement,
} from '../serverErrors'
import { ClinicalError } from './ClinicalError'

interface SigningPanelProps {
  encounterId: string
  /** Estado del autoguardado: no se firma con cambios pendientes ni con error de guardado. */
  saveStatus: AutosaveStatus
  /** Hay campos con valores que no se pueden guardar (se marcan en su sección). */
  hasInvalidFields: boolean
  /** Guarda lo pendiente antes de firmar. false = algo no se pudo guardar. */
  flushAll: () => Promise<boolean>
  /** El servidor dice que ya no es un borrador (se firmó en otra pestaña): recargar el encuentro. */
  onNotEditable: () => void
}

/**
 * Checklist de firma + botón Firmar. La lista la calcula el servidor (única fuente de verdad):
 * aquí solo se muestra y se habilita el botón con `can_sign`. Aun así se maneja `signing_blocked`
 * porque entre el último chequeo y la firma el estado pudo cambiar.
 */
export function SigningPanel({
  encounterId,
  saveStatus,
  hasInvalidFields,
  flushAll,
  onNotEditable,
}: SigningPanelProps) {
  const queryClient = useQueryClient()
  const checklist = useSigningChecklist(encounterId, true)
  const sign = useSignEncounter(encounterId)
  const [confirming, setConfirming] = useState(false)
  const [blocked, setBlocked] = useState<MissingRequirement[]>([])
  const [problem, setProblem] = useState<string | null>(null)

  const saved = saveStatus === 'idle' || saveStatus === 'saved'
  const canSign = checklist.data?.can_sign === true && saved && !sign.isPending

  async function confirmSign() {
    setBlocked([])
    setProblem(null)
    const flushed = await flushAll()
    if (!flushed) {
      setConfirming(false)
      setProblem('No se pudieron guardar los últimos cambios. Corrija los avisos antes de firmar.')
      return
    }
    try {
      await sign.mutateAsync()
      setConfirming(false)
    } catch (error) {
      setConfirming(false)
      if (isNotEditable(error)) {
        onNotEditable()
        return
      }
      const items = signingBlockedItems(error)
      if (items.length > 0) setBlocked(items)
      else setProblem(describeClinicalError(error))
      // El checklist mostrado estaba desactualizado: se vuelve a pedir.
      void queryClient.invalidateQueries({ queryKey: clinicalKeys.checklist(encounterId) })
    }
  }

  return (
    <section
      id="firma"
      aria-labelledby="signing-title"
      className="flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-5"
    >
      <h3 id="signing-title" className="text-base font-semibold text-slate-900">
        Requisitos para firmar
      </h3>
      {checklist.isPending && (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
          <Spinner /> Revisando requisitos…
        </p>
      )}
      {checklist.isError && <ClinicalError error={checklist.error} />}
      {checklist.data &&
        (checklist.data.can_sign ? (
          <Alert tone="success">Todos los requisitos están cumplidos. Puede firmar.</Alert>
        ) : (
          <ul aria-label="Requisitos pendientes" className="flex flex-col gap-1.5 text-sm">
            {checklist.data.missing.map((item) => (
              <li key={item.code} className="flex gap-2 text-slate-900">
                <span aria-hidden="true" className="text-red-700">
                  ✗
                </span>
                <span>
                  <span className="sr-only">Falta: </span>
                  {item.message}
                </span>
              </li>
            ))}
          </ul>
        ))}
      {!saved && (
        <p className="text-sm text-slate-700">
          {hasInvalidFields
            ? 'Corrija los campos marcados en la ficha para poder firmar.'
            : saveStatus === 'error'
              ? 'Hay cambios que no se pudieron guardar: resuélvalos para poder firmar.'
              : 'Espere a que terminen de guardarse los cambios para firmar.'}
        </p>
      )}
      {blocked.length > 0 && (
        <Alert tone="error" title="El servidor no permitió firmar">
          <ul className="list-disc pl-5">
            {blocked.map((item) => (
              <li key={item.code}>{item.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      {problem && <Alert tone="error">{problem}</Alert>}
      <div>
        <Button disabled={!canSign} onClick={() => setConfirming(true)}>
          Firmar encuentro
        </Button>
      </div>

      <Dialog
        open={confirming}
        onClose={() => {
          if (!sign.isPending) setConfirming(false)
        }}
        title="Firmar encuentro"
        description="Al firmar, el encuentro queda inmutable: ya no podrá editarse y solo se podrán añadir adendas. Quedarán registrados su nombre, su colegiatura y la fecha."
      >
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => setConfirming(false)}
            disabled={sign.isPending}
          >
            Cancelar
          </Button>
          <Button loading={sign.isPending} onClick={() => void confirmSign()}>
            Firmar y cerrar
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
