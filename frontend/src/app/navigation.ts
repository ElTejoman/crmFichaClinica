import type { Permission } from '@/entities/user'

export interface NavItem {
  to: string
  label: string
  /** Sin permiso = visible para cualquier usuario autenticado. */
  permission?: Permission
}

/** Fuente única de la navegación: la usan el menú lateral y las tarjetas de inicio. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Inicio' },
  { to: '/usuarios', label: 'Usuarios', permission: 'users:manage' },
  { to: '/auditoria', label: 'Auditoría', permission: 'audit:read' },
]
