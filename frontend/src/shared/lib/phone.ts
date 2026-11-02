const MIN_PHONE_DIGITS = 6
const MAX_PHONE_DIGITS = 15 // máximo E.164
const PHONE_CHARS = /^\+?[\d\s\-().]+$/

/**
 * Misma regla de fondo que el servidor (que además normaliza a `+51…`): 6 a 15 dígitos.
 * Se valida aquí solo para avisar antes de enviar; el servidor sigue siendo la autoridad.
 */
export function isValidPhone(raw: string): boolean {
  const value = raw.trim()
  if (!PHONE_CHARS.test(value)) return false
  const digits = value.replace(/\D/g, '').length
  return digits >= MIN_PHONE_DIGITS && digits <= MAX_PHONE_DIGITS
}

export const PHONE_ERROR_MESSAGE =
  'Ingrese un teléfono válido (celular de 9 dígitos o internacional con +)'
