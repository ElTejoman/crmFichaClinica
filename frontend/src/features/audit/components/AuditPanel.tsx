import { useState } from 'react'

import { ApiError } from '@/shared/lib/http'
import { Alert, Field, Pagination, Select, Spinner } from '@/shared/ui'

import { useAuditLogs } from '../api/useAudit'
import { actionLabel, AUDIT_ACTIONS } from '../labels'
import { AuditTable } from './AuditTable'
import { IntegrityCheck } from './IntegrityCheck'

export function AuditPanel() {
  const [page, setPage] = useState(0)
  const [action, setAction] = useState('')
  const logs = useAuditLogs(page, action)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-slate-900">Auditoría</h1>
      <IntegrityCheck />
      <div className="max-w-xs">
        <Field label="Filtrar por acción">
          {(c) => (
            <Select
              {...c}
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                setPage(0)
              }}
            >
              <option value="">Todas las acciones</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {logs.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando eventos…
        </p>
      )}
      {logs.isError && (
        <Alert tone="error">
          {logs.error instanceof ApiError
            ? logs.error.message
            : 'No se pudieron cargar los eventos.'}
        </Alert>
      )}
      {logs.data && (
        <>
          <AuditTable events={logs.data.events} />
          <Pagination
            page={page}
            hasNext={logs.data.hasNext}
            onPageChange={setPage}
            disabled={logs.isFetching}
          />
        </>
      )}
    </div>
  )
}
