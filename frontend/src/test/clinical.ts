import type {
  AttachmentRead,
  ClinicalSummary,
  ConsentRead,
  EncounterRead,
  PatientRead,
  VitalSignsRead,
} from '@/shared/types/aliases'

/** Doctor de las pruebas: coincide con `makeUser(['DOCTOR'], { id: DOCTOR_ID })`. */
export const DOCTOR_ID = 'd-1'

/** Encuentro de prueba: borrador vacío del doctor DOCTOR_ID, acupuntura, 3-nov-2026 09:00 Lima. */
export function makeEncounter(overrides: Partial<EncounterRead> = {}): EncounterRead {
  return {
    id: 'e-1',
    patient_id: 'p-1',
    appointment_id: null,
    doctor_user_id: DOCTOR_ID,
    doctor_name: 'Ana Torres',
    specialty: 'ACUPUNCTURE',
    status: 'DRAFT',
    occurred_at: '2026-11-03T14:00:00Z',
    subjective: null,
    objective_notes: null,
    assessment_notes: null,
    plan: null,
    followup_at: null,
    history_reviewed_at: null,
    vitals_not_applicable_reason: null,
    vitals: [],
    diagnoses: [],
    addenda: [],
    payload: null,
    signed_at: null,
    signer_name: null,
    signer_license: null,
    created_at: '2026-11-03T14:00:00Z',
    ...overrides,
  }
}

export function makeSignedEncounter(overrides: Partial<EncounterRead> = {}): EncounterRead {
  return makeEncounter({
    status: 'SIGNED',
    subjective: 'Dolor lumbar de 3 semanas',
    objective_notes: 'Contractura paravertebral',
    assessment_notes: 'Lumbalgia mecánica',
    plan: 'Acupuntura semanal',
    vitals: [makeVital()],
    diagnoses: [
      {
        icd10_code: 'M54.5',
        description: 'Lumbalgia baja',
        type: 'DEFINITIVE',
        is_primary: true,
      },
    ],
    signed_at: '2026-11-03T15:30:00Z',
    signer_name: 'Ana Torres',
    signer_license: 'CMP 12345',
    ...overrides,
  })
}

export function makeVital(overrides: Partial<VitalSignsRead> = {}): VitalSignsRead {
  return {
    context: 'SINGLE',
    measured_at: '2026-11-03T14:05:00Z',
    systolic: 120,
    diastolic: 80,
    heart_rate: 72,
    resp_rate: null,
    temperature_c: null,
    spo2: null,
    weight_kg: 70,
    height_cm: 170,
    bmi: 24.2,
    pain_vas: null,
    ...overrides,
  }
}

export function makeSummary(overrides: Partial<ClinicalSummary> = {}): ClinicalSummary {
  return {
    allergies: [],
    medications: [],
    conditions: [],
    last_vitals: null,
    last_encounter_at: null,
    signed_encounters: 0,
    consents: { general_care: true, data_processing: true },
    ...overrides,
  }
}

export function makeConsent(overrides: Partial<ConsentRead> = {}): ConsentRead {
  return {
    id: 'c-1',
    type: 'GENERAL_CARE',
    title: 'Consentimiento de atención general',
    text_version: 1,
    method: 'ON_SCREEN',
    signed_by_name: 'Rosa Quispe',
    signer_relation: null,
    witness_name: null,
    signed_at: '2026-11-03T14:00:00Z',
    revoked_at: null,
    revoked_reason: null,
    is_valid: true,
    has_signature_image: true,
    ...overrides,
  }
}

export function makeAttachment(overrides: Partial<AttachmentRead> = {}): AttachmentRead {
  return {
    id: 'att-1',
    patient_id: 'p-1',
    encounter_id: null,
    kind: 'LAB',
    original_name: 'hemograma.pdf',
    mime: 'application/pdf',
    size_bytes: 2048,
    sha256: 'a'.repeat(64),
    has_patient_consent: true,
    created_at: '2026-11-03T14:00:00Z',
    ...overrides,
  }
}

export function makePatient(overrides: Partial<PatientRead> = {}): PatientRead {
  return {
    id: 'p-1',
    document_type: 'DNI',
    document_number: '90001234',
    first_name: 'Rosa',
    last_name: 'Quispe',
    full_name: 'Rosa Quispe',
    birth_date: '1990-05-01',
    sex: 'FEMALE',
    marital_status: null,
    occupation: null,
    address: null,
    district: null,
    phone: '+51912345678',
    email: null,
    insurance: null,
    referral_source: null,
    emergency_contact: null,
    guardian: null,
    hc_number: 7,
    data_processing_consent_at: '2026-03-10T15:00:00Z',
    is_active: true,
    created_at: '2026-03-10T15:00:00Z',
    hc_code: 'HC-000007',
    age: 36,
    is_minor: false,
    ...overrides,
  }
}
