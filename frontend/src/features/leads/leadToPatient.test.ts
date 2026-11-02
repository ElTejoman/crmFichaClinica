import type { LeadRead } from '@/shared/types/aliases'

import { leadToPatientDefaults } from './leadToPatient'

const lead: LeadRead = {
  id: 'l1',
  full_name: 'Juan Carlos Pérez Gómez',
  phone: '+51912345678',
  email: 'juan@correo.pe',
  interest_specialties: ['NUTRITION'],
  source: 'INSTAGRAM',
  status: 'QUALIFIED',
  status_changed_at: '2026-03-10T15:00:00Z',
  next_action_at: null,
  assigned_to: null,
  assigned_to_name: null,
  consent_marketing: true,
  converted_patient_id: null,
  updated_at: '2026-03-10T15:00:00Z',
  lost_reason: null,
  notes: null,
  created_at: '2026-03-01T15:00:00Z',
  activities: [],
}

describe('leadToPatientDefaults', () => {
  it('traslada nombre (separado), teléfono, correo y fuente; deja pendiente lo que el lead no tiene', () => {
    const values = leadToPatientDefaults(lead)
    expect(values).toMatchObject({
      first_name: 'Juan Carlos',
      last_name: 'Pérez Gómez',
      phone: '+51912345678',
      email: 'juan@correo.pe',
      referral_source: 'INSTAGRAM',
      document_number: '',
      birth_date: '',
      sex: '',
      data_processing_consent: false,
    })
  })
})
