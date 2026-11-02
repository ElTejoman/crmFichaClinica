/**
 * Mensaje de éxito que viaja en el `state` del router al aterrizar en otra pantalla
 * (p. ej. "Paciente creado. HC-000012"). Evita acoplar features entre sí y no usa
 * almacenamiento del navegador: no deja datos personales persistidos.
 */
export interface FlashState {
  flash: string
}

export function flashState(message: string): FlashState {
  return { flash: message }
}

export function readFlash(state: unknown): string | null {
  if (typeof state === 'object' && state !== null && 'flash' in state) {
    const value = (state as { flash: unknown }).flash
    return typeof value === 'string' ? value : null
  }
  return null
}
