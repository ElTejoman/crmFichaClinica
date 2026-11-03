import type { Role } from '@/shared/types/aliases'

/**
 * Permisos de UI. Sirven SOLO para ocultar/mostrar pantallas y botones: la autorización real
 * la impone el servidor (RBAC en cada endpoint). docs/04-ROLES-Y-PERMISOS.md §2.
 */
export type Permission =
  | 'users:manage'
  | 'audit:read'
  | 'patients:read'
  | 'patients:manage'
  | 'leads:read'
  | 'leads:manage'
  | 'leads:reports'
  | 'agenda:read'
  | 'agenda:manage'
  | 'agenda:attend'
  | 'schedule:manage'
  | 'clinical:read'
  | 'clinical:write'
  | 'consents:capture'

const PERMISSION_ROLES: Record<Permission, readonly Role[]> = {
  'users:manage': ['SUPERUSER', 'OWNER'],
  'audit:read': ['SUPERUSER', 'OWNER'],
  // Pacientes y CRM. Un DOCTOR sin rol administrativo solo ve SU cartera: lo filtra el servidor.
  'patients:read': ['SUPERUSER', 'OWNER', 'DOCTOR', 'RECEPTION'],
  'patients:manage': ['OWNER', 'RECEPTION'],
  'leads:read': ['SUPERUSER', 'OWNER', 'DOCTOR', 'RECEPTION'],
  'leads:manage': ['OWNER', 'RECEPTION'],
  'leads:reports': ['OWNER'],
  // Agenda. Un DOCTOR solo recibe SUS citas (lo filtra el servidor); atender exige ser el doctor de la cita.
  'agenda:read': ['SUPERUSER', 'OWNER', 'DOCTOR', 'RECEPTION'],
  'agenda:manage': ['OWNER', 'RECEPTION'],
  'agenda:attend': ['DOCTOR'],
  'schedule:manage': ['OWNER', 'RECEPTION'],
  // Clínico (docs/04 §7). Leer contenido clínico: dueño y doctor (+ relación terapéutica, que valida el
  // servidor). Escribir: solo el rol DOCTOR; el dueño-doctor escribe por su rol DOCTOR. SUPERUSER,
  // RECEPTION y PATIENT nunca ven contenido clínico.
  'clinical:read': ['OWNER', 'DOCTOR'],
  'clinical:write': ['DOCTOR'],
  // Capturar/listar/revocar consentimientos es admisión: recepción sí. Ver la IMAGEN de la firma
  // exige 'clinical:read' (lo impone el servidor).
  'consents:capture': ['OWNER', 'DOCTOR', 'RECEPTION'],
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
