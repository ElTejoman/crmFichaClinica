import { can } from '@/entities/user'
import type { AppointmentRead, Role } from '@/shared/types/aliases'

export type AppointmentAction =
  'confirm' | 'check-in' | 'start' | 'complete' | 'reschedule' | 'no-show' | 'cancel'

export const ACTION_LABELS: Record<AppointmentAction, string> = {
  confirm: 'Confirmar',
  'check-in': 'Registrar llegada',
  start: 'Iniciar atención',
  complete: 'Completar atención',
  reschedule: 'Reprogramar',
  'no-show': 'Marcar ausencia',
  cancel: 'Cancelar cita',
}

/** Transiciones que el servidor acepta por estado (docs/07 §2). */
const MANAGE_ACTIONS_BY_STATUS: Record<AppointmentRead['status'], readonly AppointmentAction[]> = {
  SCHEDULED: ['confirm', 'check-in', 'reschedule', 'no-show', 'cancel'],
  CONFIRMED: ['check-in', 'reschedule', 'no-show', 'cancel'],
  CHECKED_IN: ['cancel'],
  IN_PROGRESS: [],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
}

const ATTEND_ACTIONS_BY_STATUS: Record<AppointmentRead['status'], readonly AppointmentAction[]> = {
  SCHEDULED: [],
  CONFIRMED: [],
  CHECKED_IN: ['start'],
  IN_PROGRESS: ['complete'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
}

const ACTION_ORDER: readonly AppointmentAction[] = [
  'confirm',
  'check-in',
  'start',
  'complete',
  'reschedule',
  'no-show',
  'cancel',
]

export interface Viewer {
  id: string
  roles: readonly Role[]
}

/**
 * Acciones que se OFRECEN en la UI: estado válido ∩ permiso. Recepción/dueño gestionan;
 * iniciar/completar solo las ve el doctor DE ESA CITA. Es solo UX: el servidor vuelve a validar.
 */
export function availableActions(
  appointment: Pick<AppointmentRead, 'status' | 'doctor_user_id'>,
  viewer: Viewer,
): AppointmentAction[] {
  const offered = new Set<AppointmentAction>()
  if (can(viewer.roles, 'agenda:manage')) {
    for (const action of MANAGE_ACTIONS_BY_STATUS[appointment.status]) offered.add(action)
  }
  if (can(viewer.roles, 'agenda:attend') && viewer.id === appointment.doctor_user_id) {
    for (const action of ATTEND_ACTIONS_BY_STATUS[appointment.status]) offered.add(action)
  }
  return ACTION_ORDER.filter((action) => offered.has(action))
}
