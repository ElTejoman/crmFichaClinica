import { MONTH_LABELS, WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS } from './labels'

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

/* ---------- Calendario de la clínica (Lima) ----------
 * Lima es UTC-5 todo el año (sin horario de verano). Todo el cálculo de días, semanas y horas se
 * hace con ese desfase fijo y aritmética UTC: nada depende de la zona horaria del navegador, que
 * en una laptop viajera o en CI podría ser otra y movería citas de día. */

/** Desfase fijo de Lima respecto a UTC. */
export const LIMA_OFFSET = '-05:00'
const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000
const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
const DAYS_PER_WEEK = 7
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_OF_DAY = /^(\d{2}):(\d{2})/

/** ¿Es una clave de día YYYY-MM-DD que existe en el calendario (no 2026-02-31)? */
export function isDateKey(value: string): boolean {
  const match = DATE_KEY.exec(value)
  if (!match) return false
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Date(ms).toISOString().slice(0, 10) === value
}

function keyToUtcMs(key: string): number {
  const match = DATE_KEY.exec(key)
  if (!match) throw new RangeError(`Clave de día inválida: ${key}`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/** Suma (o resta) días a una clave de día; cruza mes y año sin tocar zonas horarias. */
export function addDaysToKey(key: string, days: number): string {
  return new Date(keyToUtcMs(key) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Días entre dos claves de día (`to - from`). */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((keyToUtcMs(to) - keyToUtcMs(from)) / MS_PER_DAY)
}

/** Día de la semana de una clave: 0 = lunes … 6 = domingo (misma convención que el API de horarios). */
export function weekdayIndex(key: string): number {
  const sundayFirst = new Date(keyToUtcMs(key)).getUTCDay()
  return (sundayFirst + 6) % DAYS_PER_WEEK
}

/** Lunes de la semana que contiene `key` (la agenda empieza en lunes, no en domingo). */
export function startOfWeekKey(key: string): string {
  return addDaysToKey(key, -weekdayIndex(key))
}

/** Los 7 días (lunes a domingo) de la semana que empieza en `weekStartKey`. */
export function weekDayKeys(weekStartKey: string): string[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDaysToKey(weekStartKey, i))
}

/** Instante en que son las `time` (HH:MM) de Lima del día `key`. */
export function limaInstant(key: string, time = '00:00'): Date {
  return new Date(`${key}T${time}:00${LIMA_OFFSET}`)
}

export interface UtcRange {
  from: string
  to: string
}

/** Rango UTC [inicio, fin) de `days` días de Lima desde `startKey`, listo para `?from=&to=`. */
export function limaRangeUtc(startKey: string, days: number): UtcRange {
  return {
    from: limaInstant(startKey).toISOString(),
    to: limaInstant(addDaysToKey(startKey, days)).toISOString(),
  }
}

export function limaDayRangeUtc(key: string): UtcRange {
  return limaRangeUtc(key, 1)
}

export function limaWeekRangeUtc(weekStartKey: string): UtcRange {
  return limaRangeUtc(weekStartKey, DAYS_PER_WEEK)
}

/** Minutos transcurridos desde la medianoche de Lima (0-1439) de un instante. */
export function minutesSinceMidnightLima(value: Date | string): number {
  const date = typeof value === 'string' ? parseServerInstant(value) : value
  const local = date.getTime() + LIMA_OFFSET_MS
  const intoDay = ((local % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY
  return Math.floor(intoDay / MS_PER_MINUTE)
}

/** Clave de día (YYYY-MM-DD) de Lima de un instante ISO del servidor. */
export function limaDateKeyOf(iso: string): string {
  return limaDateKey(parseServerInstant(iso))
}

/** Hoy en Lima. */
export function todayLimaKey(now: Date = new Date()): string {
  return limaDateKey(now)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** "HH:MM" a partir de minutos desde medianoche (540 -> "09:00"). */
export function formatMinutes(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`
}

/** "HH:MM" -> minutos desde medianoche; null si no es una hora. */
export function parseTimeOfDay(time: string): number | null {
  const match = TIME_OF_DAY.exec(time)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours > 23 || minutes > 59 ? null : hours * 60 + minutes
}

/** Hora local de Lima en 24 h ("09:00"), determinista (no depende del ICU del navegador). */
export function formatTimeLima(value: Date | string): string {
  return formatMinutes(minutesSinceMidnightLima(value))
}

/** "09:00–09:30". */
export function formatTimeRangeLima(startIso: string, endIso: string): string {
  return `${formatTimeLima(startIso)}–${formatTimeLima(endIso)}`
}

/** "lun 03/11". */
export function formatDayShort(key: string): string {
  const [, month, day] = key.split('-')
  return `${WEEKDAY_SHORT_LABELS[weekdayIndex(key)] ?? ''} ${day}/${month}`
}

/** "lunes 3 de noviembre de 2026". */
export function formatDayLong(key: string): string {
  const [year, month, day] = key.split('-')
  const monthName = MONTH_LABELS[Number(month) - 1] ?? month
  return `${(WEEKDAY_LABELS[weekdayIndex(key)] ?? '').toLowerCase()} ${Number(day)} de ${monthName} de ${year}`
}

/** "lun 03/11 · 09:00–09:30": dónde cae un hueco o conflicto, en hora de Lima. */
export function formatSlotLima(startIso: string, endIso: string): string {
  return `${formatDayShort(limaDateKeyOf(startIso))} · ${formatTimeRangeLima(startIso, endIso)}`
}

/** Asegura un ISO con zona (el API devuelve UTC; los cuerpos que enviamos deben llevarla). */
export function toIsoInstant(iso: string): string {
  return parseServerInstant(iso).toISOString()
}

/**
 * Fecha y hora de Lima -> ISO UTC con zona. Devuelve null si alguno no es válido.
 * Sustituye a `datetime-local` del navegador, que usaría la zona del dispositivo.
 */
export function limaToIso(dateKey: string, time: string): string | null {
  if (!isDateKey(dateKey) || parseTimeOfDay(time) === null) return null
  return limaInstant(dateKey, time.slice(0, 5)).toISOString()
}
