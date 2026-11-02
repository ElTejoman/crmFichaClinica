import { Button } from './Button'

interface PaginationProps {
  page: number
  hasNext: boolean
  onPageChange: (page: number) => void
  disabled?: boolean
}

/** Paginación simple: el API no devuelve total, solo se sabe si hay página siguiente. */
export function Pagination({ page, hasNext, onPageChange, disabled }: PaginationProps) {
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
      <Button
        variant="secondary"
        disabled={disabled || page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        Anterior
      </Button>
      <span className="text-sm text-slate-700" aria-current="page">
        Página {page + 1}
      </span>
      <Button
        variant="secondary"
        disabled={disabled || !hasNext}
        onClick={() => onPageChange(page + 1)}
      >
        Siguiente
      </Button>
    </nav>
  )
}
