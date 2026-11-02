import { limaDateKeyOf, minutesSinceMidnightLima } from '@/shared/lib/dates'
import type { AppointmentRead } from '@/shared/types/aliases'

/** La rejilla cubre la jornada de la clínica; lo que cae fuera se avisa aparte, no se pierde. */
export const GRID_START_MINUTE = 7 * 60
export const GRID_END_MINUTE = 20 * 60
export const HOUR_HEIGHT_PX = 64
export const MIN_BLOCK_HEIGHT_PX = 24
/** Los huecos se proponen cada 30 min al hacer clic en el calendario. */
export const CLICK_SNAP_MINUTES = 30

const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60_000

export const GRID_HEIGHT_PX =
  ((GRID_END_MINUTE - GRID_START_MINUTE) * HOUR_HEIGHT_PX) / MINUTES_PER_HOUR

/** Horas con línea en la rejilla: 07:00 … 19:00 (la de 20:00 es el borde inferior). */
export const GRID_HOURS: readonly number[] = Array.from(
  { length: (GRID_END_MINUTE - GRID_START_MINUTE) / MINUTES_PER_HOUR },
  (_, i) => GRID_START_MINUTE / MINUTES_PER_HOUR + i,
)

export interface BlockLayout {
  appointment: AppointmentRead
  topPx: number
  heightPx: number
  /** Columna dentro del grupo de citas que se solapan (0 = la primera). */
  lane: number
  laneCount: number
}

export interface DayLayout {
  blocks: BlockLayout[]
  /** Citas del día que caen totalmente fuera de la rejilla (antes de las 07:00 o desde las 20:00). */
  outside: AppointmentRead[]
}

interface Placed {
  appointment: AppointmentRead
  start: number
  end: number
  lane: number
  laneCount: number
}

function minutesToPx(minutes: number): number {
  return (minutes * HOUR_HEIGHT_PX) / MINUTES_PER_HOUR
}

function durationMinutes(appointment: AppointmentRead): number {
  const ms = Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)
  return Math.max(Math.round(ms / MS_PER_MINUTE), 1)
}

/** Reparte las citas solapadas en columnas para que ninguna tape a otra. */
function assignLanes(items: Placed[]): void {
  let cluster: Placed[] = []
  let clusterEnd = -1
  let laneEnds: number[] = []
  const closeCluster = () => {
    for (const item of cluster) item.laneCount = laneEnds.length
    cluster = []
    laneEnds = []
    clusterEnd = -1
  }
  for (const item of items) {
    if (item.start >= clusterEnd) closeCluster()
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = item.end
    item.lane = lane
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  closeCluster()
}

/**
 * Posiciona las citas de UN día de Lima en la rejilla: `top` según la hora de inicio y `height`
 * según la duración. Se calcula con la hora de Lima (no la del navegador) para que 14:00Z se
 * dibuje a las 09:00.
 */
export function layoutDay(appointments: readonly AppointmentRead[], dayKey: string): DayLayout {
  const placed: Placed[] = []
  const outside: AppointmentRead[] = []
  for (const appointment of appointments) {
    if (limaDateKeyOf(appointment.starts_at) !== dayKey) continue
    const start = minutesSinceMidnightLima(appointment.starts_at)
    const end = start + durationMinutes(appointment)
    const visibleStart = Math.max(start, GRID_START_MINUTE)
    const visibleEnd = Math.min(end, GRID_END_MINUTE)
    if (visibleEnd <= visibleStart) {
      outside.push(appointment)
      continue
    }
    placed.push({ appointment, start: visibleStart, end: visibleEnd, lane: 0, laneCount: 1 })
  }
  placed.sort((a, b) => a.start - b.start || a.end - b.end)
  assignLanes(placed)
  return {
    outside,
    blocks: placed.map((item) => ({
      appointment: item.appointment,
      topPx: minutesToPx(item.start - GRID_START_MINUTE),
      heightPx: Math.max(minutesToPx(item.end - item.start), MIN_BLOCK_HEIGHT_PX),
      lane: item.lane,
      laneCount: item.laneCount,
    })),
  }
}

/** Hora ("HH:MM") a la que corresponde un clic a `offsetPx` del borde superior de la columna. */
export function timeFromOffset(offsetPx: number): string {
  const raw = GRID_START_MINUTE + (offsetPx * MINUTES_PER_HOUR) / HOUR_HEIGHT_PX
  const snapped = Math.floor(raw / CLICK_SNAP_MINUTES) * CLICK_SNAP_MINUTES
  const clamped = Math.min(
    Math.max(snapped, GRID_START_MINUTE),
    GRID_END_MINUTE - CLICK_SNAP_MINUTES,
  )
  const hh = String(Math.floor(clamped / MINUTES_PER_HOUR)).padStart(2, '0')
  const mm = String(clamped % MINUTES_PER_HOUR).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Posición vertical de "ahora" en la rejilla, o null si cae fuera de ella. */
export function nowOffsetPx(minutesNow: number): number | null {
  if (minutesNow < GRID_START_MINUTE || minutesNow > GRID_END_MINUTE) return null
  return minutesToPx(minutesNow - GRID_START_MINUTE)
}
