export type StatusView = { label: string; tone: 'ok' | 'warn' | 'error' }

/** Traduce el estado técnico a un mensaje comprensible para personal no técnico. */
export function describeStatus(
  isPending: boolean,
  isError: boolean,
  status?: 'ready' | 'degraded',
): StatusView {
  if (isPending) return { label: 'Comprobando conexión…', tone: 'warn' }
  if (isError) return { label: 'Sin conexión con el servidor', tone: 'error' }
  return status === 'ready'
    ? { label: 'Sistema operativo', tone: 'ok' }
    : { label: 'Base de datos no disponible', tone: 'error' }
}
