import type { Permission } from '@/entities/user'

export interface NavItem {
  to: string
  label: string
  /** Sin permiso = visible para cualquier usuario autenticado. */
  permission?: Permission
  /** Coincide solo con la ruta exacta (para que «Agenda» no quede activa dentro de sus subpáginas). */
  end?: boolean
  /** Subelemento de otro (se muestra sangrado). */
  nested?: boolean
}

/** Fuente única de la navegación: la usan el menú lateral y las tarjetas de inicio. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Inicio' },
  { to: '/pacientes', label: 'Pacientes', permission: 'patients:read' },
  { to: '/leads', label: 'CRM', permission: 'leads:read' },
  { to: '/agenda', label: 'Agenda', permission: 'agenda:read', end: true },
  { to: '/agenda/hoy', label: 'Hoy', permission: 'agenda:manage', nested: true },
  { to: '/agenda/nueva', label: 'Nueva cita', permission: 'agenda:manage', nested: true },
  { to: '/mi-agenda', label: 'Mi agenda', permission: 'agenda:attend' },
  {
    to: '/agenda/configuracion',
    label: 'Configuración de agenda',
    permission: 'schedule:manage',
    nested: true,
  },
  { to: '/usuarios', label: 'Usuarios', permission: 'users:manage' },
  { to: '/auditoria', label: 'Auditoría', permission: 'audit:read' },
]
