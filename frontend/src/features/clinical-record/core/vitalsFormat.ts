import type { VitalSignsRead } from '@/shared/types/aliases'

import { VITAL_FIELD_SPECS } from './encounterForm'

function decimalComma(value: number): string {
  return String(value).replace('.', ',')
}

/**
 * Líneas legibles de una medición ("Presión arterial: 120/80 mmHg"). La presión se junta en una
 * sola línea; el IMC es el que calculó el servidor.
 */
export function describeVitals(vital: VitalSignsRead): string[] {
  const lines: string[] = []
  if (vital.systolic !== null && vital.diastolic !== null) {
    lines.push(`Presión arterial: ${vital.systolic}/${vital.diastolic} mmHg`)
  }
  for (const spec of VITAL_FIELD_SPECS) {
    if (spec.key === 'systolic' || spec.key === 'diastolic') continue
    const value = vital[spec.key]
    if (value !== null) lines.push(`${spec.label}: ${decimalComma(value)} ${spec.unit}`)
  }
  if (vital.bmi !== null) lines.push(`IMC: ${decimalComma(vital.bmi)} kg/m² (calculado)`)
  return lines
}
