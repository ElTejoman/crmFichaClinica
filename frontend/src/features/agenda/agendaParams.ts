import {
  addDaysToKey,
  formatDayLong,
  formatDayShort,
  isDateKey,
  limaDayRangeUtc,
  limaWeekRangeUtc,
  startOfWeekKey,
  weekDayKeys,
  type UtcRange,
} from '@/shared/lib/dates'
import { ALL_SPECIALTIES } from '@/shared/lib/labels'
import type { Specialty } from '@/shared/types/aliases'

export type AgendaScope = 'semana' | 'dia'
export type AgendaMode = 'calendario' | 'lista'

/** Estado de la pantalla de agenda. Vive en la URL: se puede compartir y el botón Atrás funciona. */
export interface AgendaParams {
  /** Día de referencia (YYYY-MM-DD, Lima). */
  dateKey: string
  scope: AgendaScope
  mode: AgendaMode
  doctorId: string
  specialty: Specialty | ''
  roomId: string
  showReleased: boolean
}

export function parseAgendaParams(search: URLSearchParams, todayKey: string): AgendaParams {
  const date = search.get('fecha') ?? ''
  const specialty = search.get('especialidad') ?? ''
  return {
    dateKey: isDateKey(date) ? date : todayKey,
    scope: search.get('vista') === 'dia' ? 'dia' : 'semana',
    mode: search.get('modo') === 'lista' ? 'lista' : 'calendario',
    doctorId: search.get('doctor') ?? '',
    specialty: (ALL_SPECIALTIES as readonly string[]).includes(specialty)
      ? (specialty as Specialty)
      : '',
    roomId: search.get('sala') ?? '',
    showReleased: search.get('canceladas') === '1',
  }
}

/** Serializa omitiendo los valores por defecto para mantener la URL corta. */
export function toAgendaSearch(params: AgendaParams, todayKey: string): URLSearchParams {
  const search = new URLSearchParams()
  if (params.dateKey !== todayKey) search.set('fecha', params.dateKey)
  if (params.scope === 'dia') search.set('vista', 'dia')
  if (params.mode === 'lista') search.set('modo', 'lista')
  if (params.doctorId) search.set('doctor', params.doctorId)
  if (params.specialty) search.set('especialidad', params.specialty)
  if (params.roomId) search.set('sala', params.roomId)
  if (params.showReleased) search.set('canceladas', '1')
  return search
}

/** Días de Lima que muestra la vista: la semana (lunes a domingo) o solo el día. */
export function visibleDayKeys(params: Pick<AgendaParams, 'dateKey' | 'scope'>): string[] {
  return params.scope === 'dia' ? [params.dateKey] : weekDayKeys(startOfWeekKey(params.dateKey))
}

/** Rango UTC a consultar para esos días. */
export function visibleRange(params: Pick<AgendaParams, 'dateKey' | 'scope'>): UtcRange {
  return params.scope === 'dia'
    ? limaDayRangeUtc(params.dateKey)
    : limaWeekRangeUtc(startOfWeekKey(params.dateKey))
}

/** Día al que saltan «anterior» y «siguiente» (±7 días en semana, ±1 en día). */
export function shiftDate(
  params: Pick<AgendaParams, 'dateKey' | 'scope'>,
  direction: 1 | -1,
): string {
  return addDaysToKey(params.dateKey, direction * (params.scope === 'dia' ? 1 : 7))
}

/** Título legible del periodo mostrado: «Semana del lun 02/11 al dom 08/11» o el día completo. */
export function periodTitle(params: Pick<AgendaParams, 'dateKey' | 'scope'>): string {
  if (params.scope === 'dia') return formatDayLong(params.dateKey)
  const monday = startOfWeekKey(params.dateKey)
  return `Semana del ${formatDayShort(monday)} al ${formatDayShort(addDaysToKey(monday, 6))}`
}
