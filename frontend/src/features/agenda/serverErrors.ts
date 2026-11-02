import { formatDayShort, formatSlotLima, formatTimeLima, limaDateKeyOf } from '@/shared/lib/dates'
import { ApiError } from '@/shared/lib/http'

/** Qué mostrar al usuario: una frase y, si aplica, una lista (qué choca y cuándo, o qué sesiones fallan). */
export interface ErrorView {
  message: string
  items: string[]
}

const RESOURCE_LABELS: Record<string, string> = {
  doctor: 'Doctor',
  room: 'Sala',
  patient: 'Paciente',
}

const OVERLAP_MESSAGES: Record<string, string> = {
  doctor: 'El doctor ya tiene una cita que se cruza con ese horario.',
  room: 'La sala ya está ocupada en ese horario.',
  patient: 'El paciente ya tiene otra cita que se cruza con ese horario.',
}

const GENERIC_NETWORK = 'No se pudo completar la operación. Revise su conexión e intente de nuevo.'
const FORBIDDEN_MESSAGE = 'No tiene permiso para realizar esta acción.'
const HTTP_FORBIDDEN = 403

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function describeConflicts(details: ApiError['details']): string[] {
  const conflicts = details?.conflicts
  if (!Array.isArray(conflicts)) return []
  const items: string[] = []
  for (const conflict of conflicts) {
    if (!isRecord(conflict)) continue
    const start = asString(conflict.starts_at)
    const end = asString(conflict.ends_at)
    if (!start || !end) continue
    const resource = asString(conflict.resource)
    const label = resource ? RESOURCE_LABELS[resource] : undefined
    const when = formatSlotLima(start, end)
    items.push(label ? `${label}: ${when}` : when)
  }
  return items
}

function conflictResources(details: ApiError['details']): string[] {
  const conflicts = details?.conflicts
  if (!Array.isArray(conflicts)) return []
  return conflicts.flatMap((c) =>
    isRecord(c) && typeof c.resource === 'string' ? [c.resource] : [],
  )
}

function describeSessions(details: ApiError['details']): string[] {
  const sessions = details?.sessions
  if (!Array.isArray(sessions)) return []
  const items: string[] = []
  for (const entry of sessions) {
    if (!isRecord(entry)) continue
    const start = asString(entry.starts_at)
    const message = asString(entry.message) ?? 'No se puede agendar esta sesión.'
    const number = typeof entry.session === 'number' ? entry.session : null
    const when = start
      ? `${formatDayShort(limaDateKeyOf(start))} ${formatTimeLima(start)}`
      : 'fecha desconocida'
    items.push(`Sesión ${number ?? '?'} (${when}): ${message}`)
  }
  return items
}

/**
 * Traduce un error del API de agenda a algo accionable. Para choques (409) y paquetes (422
 * `series_invalid`) lista EXACTAMENTE qué se pisa y cuándo, en hora de Lima.
 */
export function describeAgendaError(error: unknown): ErrorView {
  if (!(error instanceof ApiError)) return { message: GENERIC_NETWORK, items: [] }
  if (error.code === 'appointment_overlap') {
    const resource = asString(error.details?.resource)
    const items = describeConflicts(error.details)
    // Si chocan varios recursos a la vez (p. ej. paciente y doctor) no se elige uno: se explica el conjunto.
    const resources = new Set(conflictResources(error.details))
    const message =
      resources.size > 1
        ? `Ese horario choca con otras citas (${[...resources].map((r) => RESOURCE_LABELS[r]?.toLowerCase() ?? r).join(' y ')}).`
        : (resource && OVERLAP_MESSAGES[resource]) || error.message
    return { message, items }
  }
  if (error.code === 'series_invalid') {
    const items = describeSessions(error.details)
    return {
      message:
        items.length > 0
          ? `El paquete no se pudo agendar: ${items.length} ${items.length === 1 ? 'sesión tiene' : 'sesiones tienen'} problemas. No se creó ninguna sesión.`
          : error.message,
      items,
    }
  }
  if (error.status === HTTP_FORBIDDEN) return { message: FORBIDDEN_MESSAGE, items: [] }
  return { message: error.message, items: [] }
}
