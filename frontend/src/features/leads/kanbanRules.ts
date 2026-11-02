import type { LeadStatus } from '@/shared/types/aliases'

/** Columnas del tablero, en orden de embudo. Perdido y Convertido viven en sus propias pestañas. */
export const OPEN_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'APPOINTMENT_SET',
] as const satisfies readonly LeadStatus[]

export type OpenStatus = (typeof OPEN_STATUSES)[number]

export function isOpenStatus(status: LeadStatus): status is OpenStatus {
  return (OPEN_STATUSES as readonly LeadStatus[]).includes(status)
}

/**
 * Destinos permitidos desde un estado. Refleja las reglas del servidor (domain/lead_funnel.py),
 * que sigue siendo la autoridad; aquí solo evitamos ofrecer movimientos que fallarían:
 *  - entre estados abiertos se mueve libremente, también hacia atrás;
 *  - a LOST se puede ir desde cualquiera abierto (exige motivo);
 *  - LOST solo se reabre como NEW;
 *  - CONVERTED nunca se asigna a mano (solo "Convertir en paciente") y de ahí no se sale.
 */
export function allowedTargets(current: LeadStatus): LeadStatus[] {
  if (current === 'CONVERTED') return []
  if (current === 'LOST') return ['NEW']
  return [...OPEN_STATUSES.filter((status) => status !== current), 'LOST']
}

export function canMove(from: LeadStatus, to: LeadStatus): boolean {
  return allowedTargets(from).includes(to)
}

/** Perder un lead exige indicar el motivo (alimenta las estadísticas de pérdida). */
export function requiresLostReason(to: LeadStatus): boolean {
  return to === 'LOST'
}
