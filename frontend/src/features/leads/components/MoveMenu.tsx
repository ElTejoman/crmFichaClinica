import { useEffect, useId, useRef, useState } from 'react'

import { LEAD_STATUS_LABELS } from '@/shared/lib/labels'
import type { LeadStatus } from '@/shared/types/aliases'
import { Button } from '@/shared/ui'

interface MoveMenuProps {
  /** Nombre del lead, para que cada botón se anuncie de forma única a lectores de pantalla. */
  leadName: string
  targets: readonly LeadStatus[]
  onSelect: (target: LeadStatus) => void
  disabled?: boolean
  label?: string
  /** Botón de tarjeta (compacto) o de cabecera (altura normal). */
  compact?: boolean
}

/**
 * Alternativa por teclado al arrastrar ("Mover a…"). Es un desplegable de botones (no un
 * `<select>`: en algunos navegadores un select cerrado cambia de valor —y dispararía el
 * movimiento— con solo pulsar una flecha). Escape lo cierra y devuelve el foco al botón.
 */
export function MoveMenu({
  leadName,
  targets,
  onSelect,
  disabled,
  label = 'Mover a…',
  compact = true,
}: MoveMenuProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open])

  if (targets.length === 0) return null

  function close() {
    setOpen(false)
    toggleRef.current?.focus()
  }

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <Button
        ref={toggleRef}
        variant="secondary"
        className={compact ? 'min-h-9 w-full px-3 py-1 text-xs' : 'w-full'}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label} ${leadName}`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </Button>
      {open && (
        <ul id={listId} ref={listRef} className="mt-1 flex flex-col gap-1">
          {targets.map((target) => (
            <li key={target}>
              <Button
                variant="ghost"
                className="min-h-9 w-full justify-start border border-slate-200 px-3 py-1 text-xs"
                onClick={() => {
                  setOpen(false)
                  onSelect(target)
                }}
              >
                {LEAD_STATUS_LABELS[target]}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
