import {
  ALL_LEAD_SOURCES,
  ALL_SPECIALTIES,
  LEAD_SOURCE_LABELS,
  SPECIALTY_LABELS,
} from '@/shared/lib/labels'
import { Field, Input, Select } from '@/shared/ui'

import type { LeadFilters as Filters } from '../api/useLeads'
import type { AssigneeOption } from '../hooks/useAssignees'

interface LeadFiltersProps {
  /** Texto de búsqueda tal como se escribe (el padre lo retrasa antes de consultar). */
  searchText: string
  onSearchTextChange: (text: string) => void
  filters: Filters
  onChange: (filters: Filters) => void
  assignees: readonly AssigneeOption[]
}

/** Búsqueda y filtros del CRM: texto, fuente, especialidad y responsable. */
export function LeadFilters({
  searchText,
  onSearchTextChange,
  filters,
  onChange,
  assignees,
}: LeadFiltersProps) {
  return (
    <form
      role="search"
      aria-label="Filtros de leads"
      onSubmit={(e) => e.preventDefault()}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <Field label="Buscar" hint="Nombre, teléfono o correo.">
        {(c) => (
          <Input
            type="search"
            autoComplete="off"
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            {...c}
          />
        )}
      </Field>
      <Field label="Fuente">
        {(c) => (
          <Select
            {...c}
            value={filters.source}
            onChange={(e) => onChange({ ...filters, source: e.target.value })}
          >
            <option value="">Todas</option>
            {ALL_LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABELS[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Especialidad">
        {(c) => (
          <Select
            {...c}
            value={filters.specialty}
            onChange={(e) => onChange({ ...filters, specialty: e.target.value })}
          >
            <option value="">Todas</option>
            {ALL_SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {SPECIALTY_LABELS[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Responsable">
        {(c) => (
          <Select
            {...c}
            value={filters.assignedTo}
            onChange={(e) => onChange({ ...filters, assignedTo: e.target.value })}
          >
            <option value="">Todos</option>
            {assignees.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </form>
  )
}
