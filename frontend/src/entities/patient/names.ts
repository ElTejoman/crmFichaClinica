/** Partículas que forman parte de un apellido compuesto ("de la Cruz", "del Río"). */
const SURNAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa'])

/**
 * Separa un nombre completo en nombres y apellidos para pre-rellenar el alta de paciente.
 * Heurística para nombres peruanos (dos apellidos): los dos últimos términos son apellidos y
 * las partículas ("de", "del"…) se pegan al apellido. Es solo una sugerencia: el usuario la edita.
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return { firstName: words[0] ?? '', lastName: '' }

  // Con tres términos se asume 1 nombre + 2 apellidos, lo más común en Perú.
  let surnameStart = words.length <= 3 ? 1 : words.length - 2
  while (surnameStart > 1 && SURNAME_PARTICLES.has((words[surnameStart - 1] ?? '').toLowerCase())) {
    surnameStart -= 1
  }
  return {
    firstName: words.slice(0, surnameStart).join(' '),
    lastName: words.slice(surnameStart).join(' '),
  }
}
