import { addDaysToKey, formatTimeLima, limaDateKeyOf, limaToIso } from '@/shared/lib/dates'

export const SERIES_MIN_COUNT = 2
export const SERIES_MAX_COUNT = 20
export const SERIES_MIN_INTERVAL = 1
export const SERIES_MAX_INTERVAL = 30
export const SERIES_DEFAULT_INTERVAL = 7

export interface SeriesSession {
  /** 1, 2, 3… (coincide con `session` de los errores `series_invalid`). */
  session: number
  dayKey: string
  /** HH:MM de Lima: igual en todas las sesiones. */
  time: string
  startsAt: string
}

/**
 * Vista previa de un paquete: N sesiones a la MISMA hora local, cada `intervalDays` días.
 * Es lo mismo que calcula el servidor; se muestra para que recepción confirme las fechas.
 */
export function previewSeries(
  firstStartsAt: string,
  count: number,
  intervalDays: number,
): SeriesSession[] {
  const firstDay = limaDateKeyOf(firstStartsAt)
  const time = formatTimeLima(firstStartsAt)
  const sessions: SeriesSession[] = []
  for (let index = 0; index < count; index += 1) {
    const dayKey = addDaysToKey(firstDay, index * intervalDays)
    const startsAt = limaToIso(dayKey, time)
    if (startsAt) sessions.push({ session: index + 1, dayKey, time, startsAt })
  }
  return sessions
}

export function isValidSeries(count: number, intervalDays: number): boolean {
  return (
    Number.isInteger(count) &&
    count >= SERIES_MIN_COUNT &&
    count <= SERIES_MAX_COUNT &&
    Number.isInteger(intervalDays) &&
    intervalDays >= SERIES_MIN_INTERVAL &&
    intervalDays <= SERIES_MAX_INTERVAL
  )
}
