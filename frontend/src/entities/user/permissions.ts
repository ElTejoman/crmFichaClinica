import type { Role } from '@/shared/types/aliases'

/**
 * Permisos de UI. Sirven SOLO para ocultar/mostrar pantallas y botones: la autorización real
 * la impone el servidor (RBAC en cada endpoint). docs/04-ROLES-Y-PERMISOS.md §2.
 */
export type Permission = 'users:manage' | 'audit:read'

const PERMISSION_ROLES: Record<Permission, readonly Role[]> = {
  'users:manage': ['SUPERUSER', 'OWNER'],
  'audit:read': ['SUPERUSER', 'OWNER'],
}

/** ¿Alguno de los roles del usuario concede el permiso? (usuario con múltiples roles = unión). */
export function can(roles: readonly Role[] | undefined, permission: Permission): boolean {
  if (!roles) return false
  const allowed = PERMISSION_ROLES[permission]
  return roles.some((role) => allowed.includes(role))
}

/** Solo SUPERUSER puede asignar/retirar SUPERUSER u OWNER (el servidor lo impone; la UI lo oculta). */
const PRIVILEGED_ROLES: readonly Role[] = ['SUPERUSER', 'OWNER']

export function canAssignRole(actorRoles: readonly Role[], role: Role): boolean {
  return !PRIVILEGED_ROLES.includes(role) || actorRoles.includes('SUPERUSER')
}

/**
 * Un usuario con rol privilegiado solo lo modifica un SUPERUSER (o él mismo): evita que un OWNER
 * edite o desactive a quien lo administra. Se replica para deshabilitar botones; manda el servidor.
 */
export function canManageUser(
  actor: { id: string; roles: readonly Role[] },
  target: { id: string; roles: readonly Role[] },
): boolean {
  if (actor.id === target.id || actor.roles.includes('SUPERUSER')) return true
  return !target.roles.some((role) => PRIVILEGED_ROLES.includes(role))
}
