import { NavLink, Outlet } from 'react-router-dom'

import { can } from '@/entities/user'
import { useAuth } from '@/features/auth'
import { roleLabel } from '@/shared/lib/labels'
import { Badge, Button } from '@/shared/ui'

import { NAV_ITEMS } from './navigation'

const NAV_LINK_BASE =
  'rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/**
 * Marco de la app autenticada. Tablet/escritorio (lg+): barra lateral fija. Pantallas más
 * angostas: cabecera con navegación horizontal desplazable. La navegación se filtra por rol.
 */
export function AppLayout() {
  const { user, logout } = useAuth()
  if (!user) return null
  const items = NAV_ITEMS.filter((item) => !item.permission || can(user.roles, item.permission))

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:rounded-md focus:bg-white focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <aside className="flex flex-col gap-4 border-b border-slate-300 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
        <p className="text-lg font-semibold text-brand-700">CRM Clínica</p>
        <nav aria-label="Principal" className="-mx-1 overflow-x-auto">
          <ul className="flex gap-1 px-1 lg:flex-col">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `${NAV_LINK_BASE} block ${isActive ? 'bg-brand-100 text-brand-700' : 'text-slate-700 hover:bg-slate-100'}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:mt-auto lg:flex-col lg:items-stretch">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900" title={user.full_name}>
              {user.full_name}
            </p>
            <ul className="mt-1 flex flex-wrap gap-1" aria-label="Roles">
              {user.roles.map((role) => (
                <li key={role}>
                  <Badge tone="brand">{roleLabel(role)}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <Button variant="secondary" onClick={() => void logout()}>
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
