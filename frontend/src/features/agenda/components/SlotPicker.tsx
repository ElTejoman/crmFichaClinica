import { useEffect, useRef } from 'react'

import { formatDayLong, formatTimeLima } from '@/shared/lib/dates'
import { Alert, Spinner } from '@/shared/ui'

import { groupSlotsByDay, type ChosenSlot } from '../availability'
import { useAvailability } from '../api/useBooking'
import { AgendaError } from './AgendaError'

export interface SlotAutoSelect {
  /** Doctor del hueco a pre-seleccionar ('' = cualquiera). */
  doctorId: string
  /** HH:MM de Lima. */
  time: string
}

interface SlotPickerProps {
  /** Query string de disponibilidad (`availabilityQuery`), o null si aún no se puede buscar. */
  query: string | null
  selected: ChosenSlot | null
  onSelect: (slot: ChosenSlot) => void
  /** Hueco a elegir solo una vez, cuando llegan los datos (clic en el calendario). */
  autoSelect?: SlotAutoSelect | undefined
  /** Aviso si el hueco pre-seleccionado ya no existe. */
  onAutoSelectMissed?: () => void
}

/** Huecos libres agrupados por día y doctor, como botones (aria-pressed marca el elegido). */
export function SlotPicker({
  query,
  selected,
  onSelect,
  autoSelect,
  onAutoSelectMissed,
}: SlotPickerProps) {
  const availability = useAvailability(query)
  const autoDone = useRef(false)
  const data = availability.data
  const days = data ? groupSlotsByDay(data) : []

  useEffect(() => {
    if (!autoSelect || autoDone.current || !data || availability.isFetching) return
    autoDone.current = true
    for (const day of groupSlotsByDay(data)) {
      for (const doctor of day.doctors) {
        if (autoSelect.doctorId && doctor.doctorId !== autoSelect.doctorId) continue
        const match = doctor.slots.find((s) => formatTimeLima(s.starts_at) === autoSelect.time)
        if (match) {
          onSelect({
            doctorId: doctor.doctorId,
            doctorName: doctor.doctorName,
            startsAt: match.starts_at,
            endsAt: match.ends_at,
          })
          return
        }
      }
    }
    onAutoSelectMissed?.()
  }, [autoSelect, data, availability.isFetching, onSelect, onAutoSelectMissed])

  if (query === null) {
    return (
      <p className="text-sm text-slate-600">
        Complete la especialidad, el tipo de cita y un rango de fechas válido para ver los huecos.
      </p>
    )
  }
  if (availability.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-slate-600">
        <Spinner /> Buscando huecos libres…
      </p>
    )
  }
  if (availability.isError) return <AgendaError error={availability.error} />
  if (days.length === 0) {
    return (
      <Alert tone="warning">
        No hay huecos libres en ese rango. Pruebe con otras fechas u otro doctor.
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section key={day.dayKey} aria-label={formatDayLong(day.dayKey)}>
          <h4 className="text-sm font-semibold text-slate-900 first-letter:uppercase">
            {formatDayLong(day.dayKey).replace(/ de \d{4}$/, '')}
          </h4>
          <div className="mt-1.5 flex flex-col gap-2">
            {day.doctors.map((doctor) => (
              <div key={doctor.doctorId} className="flex flex-col gap-1">
                <span className="text-sm text-slate-700">{doctor.doctorName}</span>
                <ul className="flex flex-wrap gap-1.5">
                  {doctor.slots.map((slot) => {
                    const isSelected =
                      selected?.doctorId === doctor.doctorId && selected.startsAt === slot.starts_at
                    return (
                      <li key={slot.starts_at}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={`${formatTimeLima(slot.starts_at)}, ${doctor.doctorName}, ${formatDayLong(day.dayKey)}`}
                          onClick={() =>
                            onSelect({
                              doctorId: doctor.doctorId,
                              doctorName: doctor.doctorName,
                              startsAt: slot.starts_at,
                              endsAt: slot.ends_at,
                            })
                          }
                          className={`min-h-9 min-w-16 rounded-md border px-2.5 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
                            isSelected
                              ? 'border-brand-700 bg-brand-700 text-white'
                              : 'border-slate-400 bg-white text-slate-800 hover:bg-brand-50'
                          }`}
                        >
                          {isSelected && <span aria-hidden="true">✓ </span>}
                          {formatTimeLima(slot.starts_at)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
