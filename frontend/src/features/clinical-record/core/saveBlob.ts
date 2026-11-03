/** Algunos navegadores aún leen la URL justo después de `click()`: se revoca un instante después. */
export const REVOKE_DELAY_MS = 1000

/** Caracteres que un sistema de archivos no admite en un nombre. */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g
const FIRST_PRINTABLE_CODE = 32

/** Sustituye también los caracteres de control (código < 32), sin una regex de control. */
export function safeFilename(name: string): string {
  const printable = Array.from(name, (char) =>
    char.charCodeAt(0) < FIRST_PRINTABLE_CODE ? '_' : char,
  ).join('')
  const cleaned = printable.replace(UNSAFE_FILENAME_CHARS, '_').trim()
  return cleaned === '' ? 'archivo' : cleaned
}

/**
 * Entrega un `Blob` como descarga mediante un enlace temporal y lo revoca después, para que los
 * bytes clínicos no queden retenidos en memoria. Nunca se muestra el contenido en la página:
 * un adjunto es contenido no confiable (un PDF/imagen podría ser hostil).
 */
export function saveBlobAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = safeFilename(filename)
  link.rel = 'noopener'
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
