import { Link } from 'react-router-dom'

import { can } from '@/entities/user'
import { NAV_ITEMS } from '@/app/navigation'
import { useAuth } from '@/features/auth'
import { FollowupsWidget } from '@/features/leads'
import { ApiStatus } from '@/features/system-status'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/shared/lib/labels'
import { Badge } from '@/shared/ui'

/** Inicio por rol: saludo, qué puede hacer cada rol y accesos a lo que su rol permite. */
export function HomePage() {
  const { user } = useAuth()
  if (!user) return null
  const shortcuts = NAV_ITEMS.filter(
    (item) => item.to !== '/' && (!item.permission || can(user.roles, item.permission)),
  )

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-300 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Bienvenido/a, {user.full_name}</h1>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Sus roles">
          {user.roles.map((role) => (
            <li key={role}>
              <Badge tone="brand">{ROLE_LABELS[role]}</Badge>
            </li>
          ))}
        </ul>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {user.roles.map((role) => (
            <li key={role}>{ROLE_DESCRIPTIONS[role]}</li>
          ))}
        </ul>
      </section>

      {can(user.roles, 'leads:read') && <FollowupsWidget />}

      {shortcuts.length > 0 && (
        <section aria-labelledby="shortcuts-title">
          <h2 id="shortcuts-title" className="mb-3 text-lg font-semibold text-slate-900">
            Accesos
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shortcuts.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="block rounded-lg border border-slate-300 bg-white p-4 font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-2 text-sm text-slate-600">
        Estado del sistema: <ApiStatus />
      </div>
    </div>
  )
}
