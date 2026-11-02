import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

import { FOCUS_RING } from './focus'

export interface TabItem<T extends string> {
  id: T
  label: string
}

interface TabsProps<T extends string> {
  label: string
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (value: T) => void
  children: ReactNode
}

/**
 * Pestañas según el patrón WAI-ARIA: flechas/Inicio/Fin cambian de pestaña y solo la activa
 * está en el orden de tabulación (roving tabindex). El contenido activo va en `children`.
 */
export function Tabs<T extends string>({ label, tabs, value, onChange, children }: TabsProps<T>) {
  const baseId = useId()
  const refs = useRef(new Map<T, HTMLButtonElement>())

  function select(id: T) {
    onChange(id)
    refs.current.get(id)?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1
    const target: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }
    const next = target[event.key]
    const item = next === undefined ? undefined : tabs[next]
    if (!item) return
    event.preventDefault()
    select(item.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b border-slate-300"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === value
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) refs.current.set(tab.id, node)
                else refs.current.delete(tab.id)
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap ${FOCUS_RING} ${
                selected
                  ? 'border-brand-700 text-brand-700'
                  : 'border-transparent text-slate-700 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${value}`}>
        {children}
      </div>
    </div>
  )
}
