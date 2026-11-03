import { useId, useState, type KeyboardEvent } from 'react'

import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { Input } from '@/shared/ui'

import { ICD10_MIN_QUERY_LENGTH, useIcd10Search } from '../api/useIcd10'
import { normalizeIcd10Code } from '../icd10'

const SEARCH_DEBOUNCE_MS = 250

export interface Icd10Choice {
  code: string
  description: string
  /** false = código escrito a mano que no está en el catálogo cargado. */
  fromCatalog: boolean
}

interface Option extends Icd10Choice {
  id: string
  label: string
}

/**
 * Buscador CIE-10 accesible (patrón combobox WAI-ARIA 1.2): se escribe código o texto, las
 * flechas recorren los resultados, Enter elige y Escape cierra. El foco nunca sale del campo:
 * `aria-activedescendant` indica la opción activa a los lectores de pantalla. Si el código es
 * válido pero el catálogo (hoy solo una muestra) no lo trae, se ofrece usarlo con descripción manual.
 */
export function Icd10Combobox({
  onSelect,
  disabled = false,
}: {
  onSelect: (choice: Icd10Choice) => void
  disabled?: boolean
}) {
  const baseId = useId()
  const listId = `${baseId}-list`
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS)
  const search = useIcd10Search(debounced)

  const searchable = text.trim().length >= ICD10_MIN_QUERY_LENGTH
  const settled = debounced === text && !search.isFetching
  const results = searchable ? (search.data ?? []) : []
  const manualCode = normalizeIcd10Code(text)
  const showManual =
    searchable && settled && manualCode !== null && !results.some((r) => r.code === manualCode)

  const options: Option[] = results.map((r, index) => ({
    id: `${baseId}-opt-${index}`,
    label: `${r.code} — ${r.description}`,
    code: r.code,
    description: r.description,
    fromCatalog: true,
  }))
  if (showManual && manualCode) {
    options.push({
      id: `${baseId}-opt-manual`,
      label: `Usar el código ${manualCode} aunque no esté en el catálogo (escribirá la descripción)`,
      code: manualCode,
      description: '',
      fromCatalog: false,
    })
  }

  const expanded = open && options.length > 0
  const active = activeIndex >= 0 ? options[activeIndex] : undefined

  function choose(option: Option) {
    onSelect({
      code: option.code,
      description: option.description,
      fromCatalog: option.fromCatalog,
    })
    setText('')
    setOpen(false)
    setActiveIndex(-1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (options.length === 0) return
      setOpen(true)
      setActiveIndex((i) => Math.min(i + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      // Enter nunca debe enviar el formulario de la ficha desde este campo.
      event.preventDefault()
      if (expanded && active) choose(active)
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  let announcement = ''
  if (searchable && !settled) announcement = 'Buscando…'
  else if (searchable && options.length > 0) {
    announcement = `${options.length} ${options.length === 1 ? 'resultado' : 'resultados'}. Use las flechas arriba y abajo para recorrerlos y Enter para elegir.`
  } else if (searchable) {
    announcement =
      'Sin resultados en el catálogo. Escriba el código CIE-10 completo para usarlo a mano.'
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={`${baseId}-input`} className="text-sm font-medium text-slate-800">
        Buscar diagnóstico CIE-10
      </label>
      <Input
        id={`${baseId}-input`}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? active?.id : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder="Código o nombre, p. ej. M54.5 o lumbalgia"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Resultados del catálogo CIE-10"
        hidden={!expanded}
        className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-400 bg-white py-1 shadow-lg"
      >
        {options.map((option, index) => (
          <li
            key={option.id}
            id={option.id}
            role="option"
            aria-selected={index === activeIndex}
            // mousedown (no click) para elegir antes de que el blur del campo cierre la lista.
            onMouseDown={(event) => {
              event.preventDefault()
              choose(option)
            }}
            className={`cursor-pointer px-3 py-2 text-sm ${
              index === activeIndex
                ? 'bg-brand-100 text-brand-700'
                : 'text-slate-900 hover:bg-slate-100'
            } ${option.fromCatalog ? '' : 'border-t border-slate-200 italic'}`}
          >
            {option.label}
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="text-xs text-slate-600">
        {announcement}
      </p>
    </div>
  )
}
