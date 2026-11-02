export interface BarItem {
  label: string
  value: number
}

const PERCENT = 100

/**
 * Barras horizontales con CSS puro. Cada fila lleva el valor y el porcentaje en TEXTO: la barra
 * es solo un refuerzo visual (aria-hidden), así que la información no depende de verla.
 */
export function BarList({
  title,
  items,
  total,
  note,
}: {
  title: string
  items: readonly BarItem[]
  total: number
  note?: string
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-4" aria-label={title}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-slate-600">{note}</p>}
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">Sin datos todavía.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {sorted.map((item) => {
            const share = total > 0 ? Math.round((item.value / total) * PERCENT) : 0
            return (
              <li key={item.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-800">{item.label}</span>
                  <span className="shrink-0 font-medium text-slate-900">
                    {item.value} · {share}%
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-200" aria-hidden="true">
                  <div
                    className="h-2 rounded-full bg-brand-600"
                    style={{ width: `${Math.max(share, item.value > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
