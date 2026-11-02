/** La clínica opera en Lima; la BD guarda UTC (decisión del proyecto), por eso se convierte al mostrar. */
export const CLINIC_TIME_ZONE = 'America/Lima'

const formatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: CLINIC_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'medium',
})

const HAS_TIME_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i

/** Formatea un instante ISO en hora de Lima. Un ISO sin zona se interpreta como UTC (así lo guarda el servidor). */
export function formatDateTimeLima(iso: string): string {
  const date = new Date(HAS_TIME_ZONE.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(date.getTime()) ? iso : formatter.format(date)
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const limaDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Fecha calendario (YYYY-MM-DD) en hora de Lima. La edad y la obligatoriedad de apoderado se
 * calculan con la fecha de la clínica —igual que el servidor— y no con la del dispositivo.
 */
export function limaDateKey(date: Date = new Date()): string {
  const parts = Object.fromEntries(limaDateParts.formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** Un `date` de Postgres (YYYY-MM-DD) se muestra tal cual, sin convertir zonas: no es un instante. */
export function formatCalendarDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate
}

const shortDateTime = new Intl.DateTimeFormat('es-PE', {
  timeZone: CLINIC_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
})

/** Fecha y hora sin segundos, en hora de Lima (listas y tarjetas). */
export function formatShortDateTimeLima(iso: string): string {
  const date = new Date(HAS_TIME_ZONE.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(date.getTime()) ? iso : shortDateTime.format(date)
}

/** Interpreta un ISO del servidor (sin zona = UTC) como instante. */
export function parseServerInstant(iso: string): Date {
  return new Date(HAS_TIME_ZONE.test(iso) ? iso : `${iso}Z`)
}

/**
 * Convierte el valor de `<input type="datetime-local">` (hora local del navegador, sin zona) a
 * ISO con zona (UTC): el servidor rechaza fechas sin zona para evitar ambigüedades.
 */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
