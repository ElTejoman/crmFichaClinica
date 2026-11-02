import { ApiError } from '@/shared/lib/http'
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, SPECIALTY_LABELS } from '@/shared/lib/labels'
import { Alert, Spinner } from '@/shared/ui'

import { useLeadStats } from '../api/useLeads'
import { BarList } from './BarList'

const PERCENT = 100

function labelFrom(map: Record<string, string>, key: string): string {
  return map[key] ?? key
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-4">
      <dt className="text-xs font-medium tracking-wide text-slate-600 uppercase">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
    </div>
  )
}

/** Estadísticas del CRM (solo dueño): totales, tasa de conversión y desgloses. */
export function LeadStatsPanel() {
  const stats = useLeadStats()

  if (stats.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-slate-600">
        <Spinner /> Cargando estadísticas…
      </p>
    )
  }
  if (stats.isError) {
    return (
      <Alert tone="error">
        {stats.error instanceof ApiError
          ? stats.error.message
          : 'No se pudieron cargar las estadísticas.'}
      </Alert>
    )
  }

  const data = stats.data
  const toItems = (counts: Record<string, number>, labels: Record<string, string>) =>
    Object.entries(counts).map(([key, value]) => ({ label: labelFrom(labels, key), value }))

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Resumen del CRM">
        <StatCard label="Total de leads" value={String(data.total)} />
        <StatCard label="Abiertos" value={String(data.open)} />
        <StatCard label="Convertidos" value={String(data.converted)} />
        <StatCard label="Perdidos" value={String(data.lost)} />
        <StatCard
          label="Tasa de conversión"
          value={`${(data.conversion_rate * PERCENT).toFixed(1)} %`}
        />
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Leads por estado"
          items={toItems(data.by_status, LEAD_STATUS_LABELS)}
          total={data.total}
        />
        <BarList
          title="Leads por fuente"
          items={toItems(data.by_source, LEAD_SOURCE_LABELS)}
          total={data.total}
        />
        <BarList
          title="Interés por especialidad"
          items={toItems(data.by_specialty, SPECIALTY_LABELS)}
          total={data.total}
          note="Un lead puede interesarse en varias especialidades."
        />
        <BarList
          title="Motivos de pérdida"
          items={toItems(data.lost_reasons, {})}
          total={data.lost}
        />
      </div>
    </div>
  )
}
