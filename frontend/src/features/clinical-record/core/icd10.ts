/**
 * Formato CIE-10: letra (sin U) + 2 dígitos [+ punto + 1-4 alfanuméricos]. Espeja la norma del
 * servidor (`normalize_icd10`) solo para avisar antes de enviar; el servidor sigue validando.
 */
const ICD10_PATTERN = /^[A-TV-Z]\d{2}(\.[0-9A-Z]{1,4})?$/
const ICD10_BLOCK_LENGTH = 3

/** "m545" -> "M54.5". Devuelve null si no tiene forma de código CIE-10. */
export function normalizeIcd10Code(raw: string): string | null {
  let code = raw.trim().toUpperCase().replaceAll(' ', '')
  if (code.length > ICD10_BLOCK_LENGTH && !code.includes('.')) {
    code = `${code.slice(0, ICD10_BLOCK_LENGTH)}.${code.slice(ICD10_BLOCK_LENGTH)}`
  }
  return ICD10_PATTERN.test(code) ? code : null
}
