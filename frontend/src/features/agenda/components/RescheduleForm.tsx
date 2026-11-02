import { useState } from 'react'

import { useDoctors } from '@/entities/doctor'
import { addDaysToKey, todayLimaKey, toIsoInstant } from '@/shared/lib/dates'
import { SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { AppointmentRead } from '@/shared/types/aliases'
import { Button, Field, Select } from '@/shared/ui'

import type { ChosenSlot } from '../availability'
import { availabilityQuery, emptyDraft, MANUAL_DURATION, rangeError } from '../booking'
import { AgendaError } from './AgendaError'
import { DateRangeFields } from './DateRangeFields'
import { SlotPicker } from './SlotPicker'

const MS_PER_MINUTE = 60_000

interface RescheduleFormProps {
  appointment: AppointmentRead
  onConfirm: (body: { starts_at: string; doctor_user_id?: string }) => void
  onBack: () => void
  loading: boolean
  error: unknown
}

/** Reprograma reutilizando el selector de huecos: misma duración, mismo doctor salvo que se cambie. */
export function RescheduleForm({
  appointment,
  onConfirm,
  onBack,
  loading,
  error,
}: RescheduleFormProps) {
  const doctors = useDoctors()
  const today = todayLimaKey()
  const [range, setRange] = useState({ from: today, to: addDaysToKey(today, 6) })
  const [doctorId, setDoctorId] = useState(appointment.doctor_user_id)
  const [slot, setSlot] = useState<ChosenSlot | null>(null)

  const duration = Math.round(
    (Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / MS_PER_MINUTE,
  )
  const draft = {
    ...emptyDraft(today, addDaysToKey),
    specialty: appointment.specialty,
    doctorId,
    typeId: MANUAL_DURATION,
    manualDuration: String(duration),
    fromDate: range.from,
    toDate: range.to,
  }
  const query = rangeError(range.from, range.to) === null ? availabilityQuery(draft, []) : null
  const candidates = (doctors.data ?? []).filter((d) =>
    d.specialties.includes(appointment.specialty),
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-700">
        Elija un nuevo horario de {duration} min para {SPECIALTY_LABELS[appointment.specialty]}. La
        cita volverá a estado «Agendada» y deberá confirmarse otra vez.
      </p>
      <Field label="Doctor">
        {(c) => (
          <Select
            value={doctorId}
            onChange={(e) => {
              setDoctorId(e.target.value)
              setSlot(null)
            }}
            {...c}
          >
            {candidates.length === 0 && (
              <option value={appointment.doctor_user_id}>{appointment.doctor_name}</option>
            )}
            {candidates.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <DateRangeFields
        from={range.from}
        to={range.to}
        onChange={(next) => {
          setRange(next)
          setSlot(null)
        }}
      />
      <SlotPicker query={query} selected={slot} onSelect={setSlot} />
      {error ? <AgendaError error={error} /> : null}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onBack} disabled={loading}>
          Volver
        </Button>
        <Button
          loading={loading}
          disabled={!slot}
          onClick={() => {
            if (!slot) return
            onConfirm({
              starts_at: toIsoInstant(slot.startsAt),
              ...(doctorId !== appointment.doctor_user_id ? { doctor_user_id: slot.doctorId } : {}),
            })
          }}
        >
          Reprogramar
        </Button>
      </div>
    </div>
  )
}
