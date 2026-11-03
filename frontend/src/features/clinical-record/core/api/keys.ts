/** Raíces de caché del núcleo clínico: toda clave empieza por `clinical`. */
export const clinicalKeys = {
  all: ['clinical'] as const,
  summary: (patientId: string) => ['clinical', 'summary', patientId] as const,
  allergies: (patientId: string) => ['clinical', 'allergies', patientId] as const,
  medications: (patientId: string) => ['clinical', 'medications', patientId] as const,
  conditions: (patientId: string) => ['clinical', 'conditions', patientId] as const,
  encounters: (patientId: string) => ['clinical', 'encounters', patientId] as const,
  encounter: (encounterId: string) => ['clinical', 'encounter', encounterId] as const,
  checklist: (encounterId: string) => ['clinical', 'checklist', encounterId] as const,
  icd10: (query: string) => ['clinical', 'icd10', query] as const,
  consents: (patientId: string) => ['clinical', 'consents', patientId] as const,
  templates: ['clinical', 'consent-templates'] as const,
  attachments: (patientId: string) => ['clinical', 'attachments', patientId] as const,
}
