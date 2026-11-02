import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <p className="text-5xl font-semibold text-slate-400" aria-hidden="true">
        404
      </p>
      <h1 className="text-2xl font-semibold text-slate-900">Página no encontrada</h1>
      <p className="text-slate-600">La dirección no existe o fue movida.</p>
      <Link
        to="/"
        className="font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        Volver al inicio
      </Link>
    </section>
  )
}
