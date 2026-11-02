import type { DocumentType } from '@/shared/types/aliases'

/**
 * Patrones por tipo de documento, iguales a los del servidor (domain/patient_rules.py).
 * CE/pasaporte/otro son formatos aflojados a propósito **[VERIFICAR]** para no rechazar
 * documentos legítimos; por eso aquí solo se avisa y el servidor sigue siendo la autoridad.
 */
const DOCUMENT_RULES: Record<DocumentType, { pattern: RegExp; message: string }> = {
  DNI: { pattern: /^\d{8}$/, message: 'El DNI debe tener exactamente 8 dígitos' },
  CE: {
    pattern: /^[A-Z0-9]{9,12}$/,
    message: 'El carné de extranjería debe tener 9 a 12 letras o números',
  },
  PASSPORT: {
    pattern: /^[A-Z0-9]{6,12}$/,
    message: 'El pasaporte debe tener 6 a 12 letras o números',
  },
  OTHER: { pattern: /^[A-Z0-9-]{4,20}$/, message: 'El documento debe tener 4 a 20 caracteres' },
}

/** Quita espacios y pasa a mayúsculas, como el servidor, antes de validar. */
export function normalizeDocument(value: string): string {
  return value.replace(/\s/g, '').toUpperCase()
}

/** Mensaje de error del documento, o `null` si el formato es válido. */
export function documentError(type: DocumentType, value: string): string | null {
  const { pattern, message } = DOCUMENT_RULES[type]
  return pattern.test(normalizeDocument(value)) ? null : message
}
