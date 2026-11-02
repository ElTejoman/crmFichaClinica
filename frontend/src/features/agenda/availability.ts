import { limaDateKeyOf } from '@/shared/lib/dates'
import type { AvailabilitySlot, DoctorAvailability } from '@/shared/types/aliases'

export interface DoctorDaySlots {
  doctorId: string
  doctorName: string
  slots: AvailabilitySlot[]
}

export interface DaySlots {
  /** Día de Lima (YYYY-MM-DD). */
  dayKey: string
  doctors: DoctorDaySlots[]
}

/**
 * Agrupa los huecos por DÍA DE LIMA y luego por doctor. Se agrupa por el día local (no el UTC):
 * un hueco de las 20:00 de Lima es del día siguiente en UTC y caería bajo el día equivocado.
 */
export function groupSlotsByDay(availability: readonly DoctorAvailability[]): DaySlots[] {
  const days = new Map<string, Map<string, DoctorDaySlots>>()
  for (const doctor of availability) {
    for (const slot of doctor.slots) {
      const dayKey = limaDateKeyOf(slot.starts_at)
      const doctors = days.get(dayKey) ?? new Map<string, DoctorDaySlots>()
      const entry = doctors.get(doctor.doctor_user_id) ?? {
        doctorId: doctor.doctor_user_id,
        doctorName: doctor.doctor_name,
        slots: [],
      }
      entry.slots.push(slot)
      doctors.set(doctor.doctor_user_id, entry)
      days.set(dayKey, doctors)
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, doctors]) => ({
      dayKey,
      doctors: [...doctors.values()]
        .map((d) => ({
          ...d,
          slots: [...d.slots].sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at)),
        }))
        .sort((a, b) => a.doctorName.localeCompare(b.doctorName, 'es')),
    }))
}

export interface ChosenSlot {
  doctorId: string
  doctorName: string
  startsAt: string
  endsAt: string
}
