import { Link } from 'react-router-dom'

export function ForbiddenPage() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <p className="text-5xl font-semibold text-slate-400" aria-hidden="true">
        403
      </p>
      <h1 className="text-2xl font-semibold text-slate-900">Acceso denegado</h1>
      <p className="text-slate-600">No tiene permiso para ver esta sección.</p>
      <Link
        to="/"
        className="font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        Volver al inicio
      </Link>
    </section>
  )
}
