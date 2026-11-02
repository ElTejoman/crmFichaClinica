/** Mayoría de edad (Código Civil peruano): por debajo se exige apoderado. Igual que el servidor. */
export const ADULT_AGE = 18
/** Edad máxima verosímil; evita errores de tipeo como 1900. */
export const MAX_PLAUSIBLE_AGE = 120

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

interface DateParts {
  year: number
  month: number
  day: number
}

/** Descompone YYYY-MM-DD comprobando que el día exista (2026-02-30 no es una fecha). */
export function parseIsoDate(value: string): DateParts | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const probe = new Date(Date.UTC(year, month - 1, day))
  const exists =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  return exists ? { year, month, day } : null
}

/**
 * Edad cumplida en `today` (ambas YYYY-MM-DD). Se calcula en cliente solo para mostrar/validar
 * al instante; el servidor repite la regla con la fecha de Lima y es quien decide.
 */
export function calculateAge(birthDate: string, today: string): number | null {
  const birth = parseIsoDate(birthDate)
  const now = parseIsoDate(today)
  if (!birth || !now) return null
  const hadBirthday = now.month > birth.month || (now.month === birth.month && now.day >= birth.day)
  return now.year - birth.year - (hadBirthday ? 0 : 1)
}

/** `null` si la fecha es inválida (no se puede afirmar que sea menor). */
export function isMinor(birthDate: string, today: string): boolean {
  const age = calculateAge(birthDate, today)
  return age !== null && age >= 0 && age < ADULT_AGE
}
