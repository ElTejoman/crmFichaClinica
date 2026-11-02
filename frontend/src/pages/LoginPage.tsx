import { Navigate, useLocation } from 'react-router-dom'

import { LoginForm, useAuth } from '@/features/auth'
import { Spinner } from '@/shared/ui'

/** Destino tras el login: lo guardado por RequireAuth, o el inicio. */
function destinationFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from
  return typeof from === 'string' && from.startsWith('/') && from !== '/login' ? from : '/'
}

export function LoginPage() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'authenticated') return <Navigate to={destinationFrom(location.state)} replace />
  if (status === 'loading') {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center gap-2 text-slate-600"
      >
        <Spinner className="size-5" /> Verificando sesión…
      </div>
    )
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-brand-700">CRM Clínica</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">Ingrese con su cuenta para continuar.</p>
        <LoginForm />
      </div>
    </main>
  )
}
