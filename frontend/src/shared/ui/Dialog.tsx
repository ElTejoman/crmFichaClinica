import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** Ancho máximo: `md` (por defecto) para confirmaciones; `xl` para formularios con listas. */
  size?: 'md' | 'lg' | 'xl'
  children: ReactNode
}

const SIZE_CLASS = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const

/**
 * Diálogo modal accesible: `role="dialog"` + `aria-modal`, foco atrapado dentro, Escape y clic en
 * el fondo lo cierran, y al cerrarse devuelve el foco a quien lo abrió (WCAG 2.4.3 / 2.1.2).
 * Se monta en un portal para que ningún contenedor con `overflow` (el tablero) lo recorte.
 */
export function Dialog({ open, onClose, title, description, size = 'md', children }: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  // `onClose` suele ser una función nueva en cada render: se guarda en ref para no reiniciar el efecto.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Lo de detrás deja de ser alcanzable (teclado, lectores de pantalla y clics): es un modal de verdad.
    const app = document.getElementById('root')
    app?.setAttribute('inert', '')
    return () => {
      document.body.style.overflow = previousOverflow
      app?.removeAttribute('inert')
      opener?.focus()
    }
  }, [open])

  // Escape se escucha en el documento: si el botón enfocado se deshabilita (p. ej. «Guardando…»)
  // el foco cae al <body> y un `onKeyDown` del panel ya no lo vería.
  useEffect(() => {
    if (!open) return
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [open])

  if (!open) return null

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !panelRef.current) return
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`max-h-[90vh] w-full ${SIZE_CLASS[size]} overflow-y-auto rounded-xl bg-white p-6 shadow-xl focus:outline-none`}
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-1 text-sm text-slate-700">
            {description}
          </p>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
