import {
  formatDayShort,
  formatTimeLima,
  minutesSinceMidnightLima,
  weekdayIndex,
} from '@/shared/lib/dates'
import { APPOINTMENT_STATUS_LABELS, WEEKDAY_LABELS } from '@/shared/lib/labels'
import { STATUS_PRESENTATION } from '@/entities/appointment'
import type { AppointmentRead } from '@/shared/types/aliases'

import {
  GRID_HEIGHT_PX,
  GRID_HOURS,
  HOUR_HEIGHT_PX,
  layoutDay,
  nowOffsetPx,
  timeFromOffset,
  type BlockLayout,
} from '../calendar'

const GUTTER_REM = 3.5
const DAY_MIN_REM = 6.5
/** Debajo de este alto el bloque solo cabe en una línea: el estado queda en el icono y en el nombre accesible. */
const TWO_LINE_MIN_HEIGHT_PX = 44
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700'

interface CalendarGridProps {
  dayKeys: readonly string[]
  appointments: readonly AppointmentRead[]
  todayKey: string
  now: Date
  onSelect: (appointment: AppointmentRead) => void
  /** Si se pasa, hacer clic en un hueco vacío propone una cita (solo con un doctor filtrado). */
  onFreeSlot?: (dayKey: string, time: string) => void
}

function blockLabel(appointment: AppointmentRead): string {
  return (
    `${formatTimeLima(appointment.starts_at)} a ${formatTimeLima(appointment.ends_at)}, ` +
    `${appointment.patient_name}, ${appointment.doctor_name}, ` +
    APPOINTMENT_STATUS_LABELS[appointment.status]
  )
}

function Block({
  layout,
  onSelect,
}: {
  layout: BlockLayout
  onSelect: CalendarGridProps['onSelect']
}) {
  const { appointment, topPx, heightPx, lane, laneCount } = layout
  const presentation = STATUS_PRESENTATION[appointment.status]
  const widthPct = 100 / laneCount
  return (
    <button
      type="button"
      onClick={() => onSelect(appointment)}
      aria-label={blockLabel(appointment)}
      title={blockLabel(appointment)}
      style={{
        top: topPx,
        height: heightPx - 2,
        left: `calc(${lane * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
      className={`absolute z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs shadow-sm hover:shadow-md ${presentation.blockClass} ${FOCUS}`}
    >
      <span className="block truncate font-semibold">
        <span aria-hidden="true">{presentation.icon}</span> {formatTimeLima(appointment.starts_at)}{' '}
        {appointment.patient_name}
      </span>
      {heightPx >= TWO_LINE_MIN_HEIGHT_PX && (
        <span className="block truncate">
          {APPOINTMENT_STATUS_LABELS[appointment.status]} · {appointment.doctor_name}
        </span>
      )}
    </button>
  )
}

/**
 * Calendario con CSS grid: una columna por día, una hora = HOUR_HEIGHT_PX. Las citas son botones
 * (foco y Enter/Espacio abren el detalle). El contenedor hace scroll horizontal por dentro, de
 * modo que la página no se desborda en tablet. Hora de Lima, no la del navegador.
 */
export function CalendarGrid({
  dayKeys,
  appointments,
  todayKey,
  now,
  onSelect,
  onFreeSlot,
}: CalendarGridProps) {
  const columns = `${GUTTER_REM}rem repeat(${dayKeys.length}, minmax(${DAY_MIN_REM}rem, 1fr))`
  const layouts = dayKeys.map((dayKey) => ({ dayKey, ...layoutDay(appointments, dayKey) }))
  const outside = layouts.flatMap((layout) => layout.outside)
  const nowPx = nowOffsetPx(minutesSinceMidnightLima(now))

  return (
    <div className="flex flex-col gap-2">
      <div
        className="overflow-x-auto rounded-lg border border-slate-300 bg-white"
        role="region"
        aria-label="Calendario de citas (desplazable)"
        // Una región con scroll debe poder enfocarse para recorrerla con teclado.
        tabIndex={0}
      >
        <div style={{ minWidth: `${GUTTER_REM + dayKeys.length * DAY_MIN_REM}rem` }}>
          <div
            className="sticky top-0 z-20 grid border-b border-slate-300 bg-slate-100"
            style={{ gridTemplateColumns: columns }}
          >
            <div aria-hidden="true" />
            {dayKeys.map((dayKey) => (
              <div
                key={dayKey}
                className={`px-2 py-2 text-center text-xs font-semibold ${
                  dayKey === todayKey ? 'bg-brand-100 text-brand-700' : 'text-slate-700'
                }`}
              >
                <span className="block">{WEEKDAY_LABELS[weekdayIndex(dayKey)]}</span>
                <span className="block font-normal">
                  {formatDayShort(dayKey).split(' ')[1]}
                  {dayKey === todayKey && ' · hoy'}
                </span>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <div className="relative" style={{ height: GRID_HEIGHT_PX }} aria-hidden="true">
              {GRID_HOURS.map((hour, index) => (
                <span
                  key={hour}
                  className="absolute right-1.5 -translate-y-1/2 text-xs text-slate-600 first:translate-y-0"
                  style={{ top: index * HOUR_HEIGHT_PX }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {layouts.map(({ dayKey, blocks }) => (
              <div
                key={dayKey}
                role="group"
                aria-label={`${WEEKDAY_LABELS[weekdayIndex(dayKey)]} ${formatDayShort(dayKey).split(' ')[1]}`}
                className={`relative border-l border-slate-200 ${dayKey === todayKey ? 'bg-brand-50/40' : ''}`}
                style={{ height: GRID_HEIGHT_PX }}
              >
                {/* Fondo: líneas de hora y clic en hueco. Es una ayuda para el ratón; con teclado se usa "Nueva cita". */}
                <div
                  className={`absolute inset-0 ${onFreeSlot ? 'cursor-copy' : ''}`}
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--h) - 1px), rgb(226 232 240) calc(var(--h) - 1px), rgb(226 232 240) var(--h))',
                    ['--h' as string]: `${HOUR_HEIGHT_PX}px`,
                  }}
                  onClick={
                    onFreeSlot
                      ? (event) => {
                          const rect = event.currentTarget.getBoundingClientRect()
                          onFreeSlot(dayKey, timeFromOffset(event.clientY - rect.top))
                        }
                      : undefined
                  }
                />
                {dayKey === todayKey && nowPx !== null && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 left-0 z-20 border-t-2 border-red-600"
                    style={{ top: nowPx }}
                  />
                )}
                {blocks.map((layout) => (
                  <Block key={layout.appointment.id} layout={layout} onSelect={onSelect} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {outside.length > 0 && (
        <p className="text-sm text-amber-900" role="status">
          {outside.length === 1
            ? '1 cita cae fuera del horario mostrado (07:00–20:00).'
            : `${outside.length} citas caen fuera del horario mostrado (07:00–20:00).`}{' '}
          Véalas en la vista de lista.
        </p>
      )}
    </div>
  )
}
