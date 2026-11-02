import type { ReactNode } from 'react'

import { can, type Permission } from '@/entities/user'
import { useAuth } from '@/features/auth'
import { ForbiddenPage } from '@/pages/ForbiddenPage'

/**
 * Oculta una pantalla a quien no tiene el permiso (muestra 403 sin cambiar la URL).
 * Es solo UX: aunque se evadiera, el servidor responde 403 en cada endpoint.
 */
export function RoleGuard({
  permission,
  children,
}: {
  permission: Permission
  children: ReactNode
}) {
  const { user } = useAuth()
  return can(user?.roles, permission) ? children : <ForbiddenPage />
}
