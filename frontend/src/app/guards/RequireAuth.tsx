import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/features/auth'
import { Spinner } from '@/shared/ui'

/** Protege un árbol de rutas: sin sesión redirige a /login recordando a dónde iba. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

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
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
