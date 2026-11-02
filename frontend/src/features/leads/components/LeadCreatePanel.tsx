import { useState } from 'react'

import { ApiError } from '@/shared/lib/http'
import type { LeadCreate, LeadRead } from '@/shared/types/aliases'
import { Alert } from '@/shared/ui'

import { useCreateLead } from '../api/useLeads'
import { parseLeadDuplicate, type LeadDuplicateInfo } from '../duplicates'
import type { AssigneeOption } from '../hooks/useAssignees'
import { EMPTY_LEAD_VALUES, toLeadCreate, type LeadFormValues } from '../schemas'
import { DuplicateLeadDialog } from './DuplicateLeadDialog'
import { LeadForm } from './LeadForm'

interface LeadCreatePanelProps {
  assignees: readonly AssigneeOption[]
  onCreated: (lead: LeadRead) => void
  onCancel: () => void
}

/** Alta de lead. Ante un 409 de duplicado muestra el diálogo y, si se confirma, reenvía con `allow_duplicate`. */
export function LeadCreatePanel({ assignees, onCreated, onCancel }: LeadCreatePanelProps) {
  const createLead = useCreateLead()
  const [forcedError, setForcedError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<{
    info: LeadDuplicateInfo
    payload: LeadCreate
  } | null>(null)

  async function submit(values: LeadFormValues) {
    const payload = toLeadCreate(values)
    try {
      onCreated(await createLead.mutateAsync({ payload, allowDuplicate: false }))
    } catch (error) {
      const info = error instanceof ApiError ? parseLeadDuplicate(error) : null
      if (info) setDuplicate({ info, payload })
      else throw error // el formulario lo ubica en su campo o lo muestra arriba
    }
  }

  function createAnyway() {
    if (!duplicate) return
    setForcedError(null)
    createLead.mutate(
      { payload: duplicate.payload, allowDuplicate: true },
      {
        onSuccess: (lead) => {
          setDuplicate(null)
          onCreated(lead)
        },
        onError: (error) => {
          setDuplicate(null)
          setForcedError(error instanceof ApiError ? error.message : 'No se pudo crear el lead.')
        },
      },
    )
  }

  return (
    <>
      {forcedError && <Alert tone="error">{forcedError}</Alert>}
      <LeadForm
        ariaLabel="Nuevo lead"
        initialValues={EMPTY_LEAD_VALUES}
        assignees={assignees}
        submitLabel="Crear lead"
        onSubmit={submit}
        onCancel={onCancel}
      />
      <DuplicateLeadDialog
        info={duplicate?.info ?? null}
        loading={createLead.isPending}
        onCreateAnyway={createAnyway}
        onCancel={() => setDuplicate(null)}
      />
    </>
  )
}
