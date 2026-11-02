import type { AppointmentRead } from '@/shared/types/aliases'

/** Cita de prueba: 3-nov-2026 09:00 Lima (14:00Z), 30 min, con Dra. Ana. */
export function makeAppointment(overrides: Partial<AppointmentRead> = {}): AppointmentRead {
  return {
    id: 'a-1',
    patient_id: 'p-1',
    patient_name: 'Rosa Quispe',
    patient_phone: '+51912345678',
    doctor_user_id: 'd-1',
    doctor_name: 'Ana Torres',
    specialty: 'ACUPUNCTURE',
    room_id: null,
    room_name: null,
    appointment_type_id: 't-1',
    type_name: 'Control',
    starts_at: '2026-11-03T14:00:00Z',
    ends_at: '2026-11-03T14:30:00Z',
    status: 'SCHEDULED',
    admin_notes: null,
    cancel_reason: null,
    series_id: null,
    checked_in_at: null,
    created_at: '2026-11-01T15:00:00Z',
    ...overrides,
  }
}
