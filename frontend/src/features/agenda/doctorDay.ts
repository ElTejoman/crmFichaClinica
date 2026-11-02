import { isReleased } from '@/entities/appointment'
import type { AppointmentRead } from '@/shared/types/aliases'

export interface DoctorDay {
  /** Atendiendo ahora. */
  inProgress: AppointmentRead[]
  /** Ya llegaron: en el orden en que llegaron (primero en llegar, primero en pasar). */
  queue: AppointmentRead[]
  /** El resto del día, por hora: pendientes y ya terminadas. Las canceladas/ausentes no estorban. */
  rest: AppointmentRead[]
}

function byStart(a: AppointmentRead, b: AppointmentRead): number {
  return Date.parse(a.starts_at) - Date.parse(b.starts_at)
}

/** Separa el día del doctor en «en atención», cola de espera y resto. */
export function splitDoctorDay(appointments: readonly AppointmentRead[]): DoctorDay {
  const active = appointments.filter((a) => !isReleased(a.status))
  const arrival = (a: AppointmentRead) => Date.parse(a.checked_in_at ?? a.starts_at)
  return {
    inProgress: active.filter((a) => a.status === 'IN_PROGRESS').sort(byStart),
    queue: active.filter((a) => a.status === 'CHECKED_IN').sort((a, b) => arrival(a) - arrival(b)),
    rest: active
      .filter((a) => a.status !== 'IN_PROGRESS' && a.status !== 'CHECKED_IN')
      .sort(byStart),
  }
}
