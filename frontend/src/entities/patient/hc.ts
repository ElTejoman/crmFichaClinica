const HC_DIGITS = 6

/** Presentación del N.º de historia clínica, igual que el servidor: HC-000042. */
export function formatHcCode(hcNumber: number | null): string | null {
  return hcNumber === null ? null : `HC-${String(hcNumber).padStart(HC_DIGITS, '0')}`
}
