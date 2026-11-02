import { useState } from 'react'

import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { Alert, Button, Tabs, type TabItem } from '@/shared/ui'

import { EMPTY_FILTERS, type LeadFilters as Filters } from '../api/useLeads'
import { useAssignees, type CurrentUser } from '../hooks/useAssignees'
import { ClosedLeadsList } from './ClosedLeadsList'
import { KanbanBoard } from './KanbanBoard'
import { LeadCreatePanel } from './LeadCreatePanel'
import { LeadFilters } from './LeadFilters'
import { LeadStatsPanel } from './LeadStatsPanel'

type TabId = 'board' | 'lost' | 'converted' | 'stats'

const SEARCH_DEBOUNCE_MS = 300

interface LeadsWorkspaceProps {
  currentUser: CurrentUser
  canManage: boolean
  canViewReports: boolean
}

/** Pantalla del CRM: filtros + pestañas (Tablero · Perdidos · Convertidos · Estadísticas del dueño). */
export function LeadsWorkspace({ currentUser, canManage, canViewReports }: LeadsWorkspaceProps) {
  const [tab, setTab] = useState<TabId>('board')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const q = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS)
  const effectiveFilters: Filters = { ...filters, q }
  const { options, nameOf } = useAssignees(currentUser)

  const tabs: TabItem<TabId>[] = [
    { id: 'board', label: 'Tablero' },
    { id: 'lost', label: 'Perdidos' },
    { id: 'converted', label: 'Convertidos' },
    ...(canViewReports ? [{ id: 'stats' as const, label: 'Estadísticas' }] : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">CRM · Leads</h1>
        {canManage && !creating && (
          <Button
            onClick={() => {
              setMessage(null)
              setCreating(true)
            }}
          >
            Nuevo lead
          </Button>
        )}
      </div>

      {message && <Alert tone="success">{message}</Alert>}
      {creating && (
        <LeadCreatePanel
          assignees={options}
          onCancel={() => setCreating(false)}
          onCreated={(lead) => {
            setCreating(false)
            setTab('board')
            setMessage(`Lead «${lead.full_name}» creado.`)
          }}
        />
      )}

      {tab !== 'stats' && (
        <LeadFilters
          searchText={searchText}
          onSearchTextChange={setSearchText}
          filters={filters}
          onChange={setFilters}
          assignees={options}
        />
      )}

      <Tabs label="Vistas del CRM" tabs={tabs} value={tab} onChange={setTab}>
        {tab === 'board' && (
          <KanbanBoard filters={effectiveFilters} canManage={canManage} assigneeName={nameOf} />
        )}
        {tab === 'lost' && (
          <ClosedLeadsList
            status="LOST"
            filters={effectiveFilters}
            canManage={canManage}
            assigneeName={nameOf}
          />
        )}
        {tab === 'converted' && (
          <ClosedLeadsList
            status="CONVERTED"
            filters={effectiveFilters}
            canManage={canManage}
            assigneeName={nameOf}
          />
        )}
        {tab === 'stats' && canViewReports && <LeadStatsPanel />}
      </Tabs>
    </div>
  )
}
