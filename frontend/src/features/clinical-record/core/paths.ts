/** Pestañas de la ficha del paciente que añade el núcleo clínico (van en `?tab=`; no son datos). */
export type PatientTabId = 'historia' | 'consentimientos' | 'adjuntos'

/** Ruta del editor/visor de un encuentro. Solo ids opacos en la URL: nunca datos del paciente. */
export function encounterPath(patientId: string, encounterId: string): string {
  return `/pacientes/${patientId}/encuentros/${encounterId}`
}

/** Vuelta a la historia clínica del paciente. */
export function patientTabPath(patientId: string, tab: PatientTabId): string {
  return `/pacientes/${patientId}?tab=${tab}`
}
