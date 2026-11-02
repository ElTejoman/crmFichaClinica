import { isValidPhone } from '@/shared/lib/phone'

import { calculateAge, MAX_PLAUSIBLE_AGE } from './age'

const MIN_NAME_LENGTH = 2

export interface DuplicateQuery {
  first_name: string
  last_name: string
  birth_date: string | null
  phone: string | null
}

/**
 * Decide si hay datos suficientes para buscar posibles duplicados: nombres completos y, además,
 * una fecha de nacimiento válida o un teléfono válido. Con solo el nombre habría demasiados
 * homónimos y el aviso perdería valor.
 */
export function buildDuplicateQuery(
  values: { first_name: string; last_name: string; birth_date: string; phone: string },
  today: string,
): DuplicateQuery | null {
  const first = values.first_name.trim()
  const last = values.last_name.trim()
  if (first.length < MIN_NAME_LENGTH || last.length < MIN_NAME_LENGTH) return null

  const age = calculateAge(values.birth_date, today)
  const birth = age !== null && age >= 0 && age <= MAX_PLAUSIBLE_AGE ? values.birth_date : null
  const phone = values.phone && isValidPhone(values.phone) ? values.phone.trim() : null
  if (!birth && !phone) return null
  return { first_name: first, last_name: last, birth_date: birth, phone }
}
