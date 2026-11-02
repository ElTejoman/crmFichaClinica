import { useState, type ReactNode } from 'react'

import { useDoctors } from '@/entities/doctor'
import { usePatientById } from '@/entities/patient'
import {
  addDaysToKey,
  formatDayLong,
  formatSlotLima,
  formatTimeLima,
  limaDateKeyOf,
  todayLimaKey,
} from '@/shared/lib/dates'
import { ApiError } from '@/shared/lib/http'
import { ALL_SPECIALTIES, SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { Specialty } from '@/shared/types/aliases'
import { Alert, Button, CheckboxField, Field, Input, Select, Spinner, Textarea } from '@/shared/ui'

import {
  useAppointmentTypes,
  useCreateAppointment,
  useCreateSeries,
  useRooms,
} from '../api/useBooking'
import type { ChosenSlot } from '../availability'
import {
  ADMIN_NOTES_MAX,
  availabilityQuery,
  buildAppointmentPayload,
  buildSeriesPayload,
  DURATION_ERROR,
  effectiveDuration,
  emptyDraft,
  MANUAL_DURATION,
  parseManualDuration,
  roomsFor,
  type BookingDraft,
} from '../booking'
import {
  isValidSeries,
  previewSeries,
  SERIES_MAX_COUNT,
  SERIES_MAX_INTERVAL,
  SERIES_MIN_COUNT,
  SERIES_MIN_INTERVAL,
} from '../series'
import { AgendaError } from './AgendaError'
import { DateRangeFields } from './DateRangeFields'
import { PatientPicker, type PickedPatient } from './PatientPicker'
import { SlotPicker, type SlotAutoSelect } from './SlotPicker'

export interface BookingPrefill {
  doctorId?: string
  dayKey?: string
  /** HH:MM de Lima. */
  time?: string
  specialty?: Specialty
}

export interface BookingResult {
  /** Inicio de la primera cita creada (para volver al calendario en su semana). */
  firstStartsAt: string
  count: number
}

interface BookingWizardProps {
  initialPatientId?: string | null
  prefill?: BookingPrefill
  onCreated: (result: BookingResult) => void
  onCancel?: () => void
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={`step-${number}`}
      className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-white p-4"
    >
      <h3 id={`step-${number}`} className="text-base font-semibold text-slate-900">
        <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-brand-700 text-xs text-white">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * Nueva cita, paso a paso: paciente → especialidad → doctor → tipo → fechas → huecos → sala →
 * notas → paquete. El servidor sigue siendo la autoridad: aquí solo se evita pedir lo imposible.
 */
export function BookingWizard({
  initialPatientId = null,
  prefill,
  onCreated,
  onCancel,
}: BookingWizardProps) {
  const today = todayLimaKey()
  const [draft, setDraft] = useState<BookingDraft>(() => {
    const base = emptyDraft(today, addDaysToKey)
    const day = prefill?.dayKey
    return {
      ...base,
      ...(prefill?.doctorId ? { doctorId: prefill.doctorId } : {}),
      ...(prefill?.specialty ? { specialty: prefill.specialty } : {}),
      ...(day ? { fromDate: day, toDate: day } : {}),
    }
  })
  // `undefined` = el usuario aún no eligió: vale el paciente pre-seleccionado por URL (si hay).
  const [chosenPatient, setChosenPatient] = useState<PickedPatient | null | undefined>(undefined)
  const [autoSelect, setAutoSelect] = useState<SlotAutoSelect | undefined>(
    prefill?.time ? { doctorId: prefill.doctorId ?? '', time: prefill.time } : undefined,
  )
  const [missedPrefill, setMissedPrefill] = useState(false)

  const doctors = useDoctors()
  const preselected = usePatientById(initialPatientId)
  const rooms = useRooms()
  const createAppointment = useCreateAppointment()
  const createSeries = useCreateSeries()

  const preselectedData = preselected.data
  const patient: PickedPatient | null =
    chosenPatient !== undefined
      ? chosenPatient
      : preselectedData
        ? {
            id: preselectedData.id,
            name: preselectedData.full_name,
            detail: preselectedData.hc_code ?? '',
          }
        : null

  // Clic en el calendario: si solo conocemos el doctor, su primera especialidad es la de partida.
  const prefillDoctor = (doctors.data ?? []).find((d) => d.id === prefill?.doctorId)
  const specialty: Specialty | '' =
    draft.specialty || prefill?.specialty || prefillDoctor?.specialties[0] || ''
  const types = useAppointmentTypes(specialty)
  const doctorList = doctors.data

  function patch(changes: Partial<BookingDraft>, keepSlot = false) {
    // El hueco tocado en el calendario sigue valiendo al elegir especialidad/tipo, pero no si el
    // usuario cambia de doctor o de fechas: ahí ya busca otra cosa.
    if ('doctorId' in changes || 'fromDate' in changes || 'toDate' in changes) {
      setAutoSelect(undefined)
    }
    setDraft((d) => ({ ...d, ...changes, ...(keepSlot ? {} : { slot: null }) }))
  }

  const typeList = types.data ?? []
  const fullDraft: BookingDraft = { ...draft, specialty, patientId: patient?.id ?? '' }
  const query = availabilityQuery(fullDraft, typeList)
  const offeredSpecialties = ALL_SPECIALTIES.filter(
    (s) => !doctorList || doctorList.some((d) => d.specialties.includes(s)),
  )
  const doctorsForSpecialty = (doctorList ?? []).filter(
    (d) => specialty !== '' && d.specialties.includes(specialty),
  )
  const roomOptions = roomsFor(rooms.data ?? [], specialty)
  const duration = effectiveDuration(draft, typeList)

  const count = Number(draft.seriesCount)
  const interval = Number(draft.seriesInterval)
  const seriesOk = !draft.seriesEnabled || isValidSeries(count, interval)
  const payload = draft.seriesEnabled
    ? buildSeriesPayload(fullDraft, typeList)
    : buildAppointmentPayload(fullDraft, typeList)
  const preview =
    draft.seriesEnabled && draft.slot && seriesOk
      ? previewSeries(draft.slot.startsAt, count, interval)
      : []

  const mutation = draft.seriesEnabled ? createSeries : createAppointment
  const submitting = mutation.isPending

  /** Un choque deja sin efecto el hueco elegido: se quita la selección para no reenviar lo mismo. */
  function releaseSlotOnConflict(error: unknown): null {
    if (error instanceof ApiError && error.code === 'appointment_overlap') {
      setDraft((d) => ({ ...d, slot: null }))
    }
    return null
  }

  async function submit() {
    if (!payload) return
    if (draft.seriesEnabled) {
      const series = buildSeriesPayload(fullDraft, typeList)
      if (!series) return
      const result = await createSeries.mutateAsync(series).catch(releaseSlotOnConflict)
      const first = result?.appointments[0]
      if (first) onCreated({ firstStartsAt: first.starts_at, count: result.appointments.length })
      return
    }
    const single = buildAppointmentPayload(fullDraft, typeList)
    if (!single) return
    const created = await createAppointment.mutateAsync(single).catch(releaseSlotOnConflict)
    if (created) onCreated({ firstStartsAt: created.starts_at, count: 1 })
  }

  function chooseSlot(slot: ChosenSlot) {
    setAutoSelect(undefined)
    setMissedPrefill(false)
    setDraft((d) => ({ ...d, slot }))
  }

  const manual = draft.typeId === MANUAL_DURATION
  const manualError =
    manual && draft.manualDuration !== '' && parseManualDuration(draft.manualDuration) === null
      ? DURATION_ERROR
      : undefined

  return (
    <form
      noValidate
      aria-label="Nueva cita"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-4"
    >
      <Step number={1} title="Paciente">
        {preselected.isPending && initialPatientId && !patient && (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <Spinner /> Cargando paciente…
          </p>
        )}
        {preselected.isError && <AgendaError error={preselected.error} />}
        <PatientPicker value={patient} onChange={setChosenPatient} />
      </Step>

      <Step number={2} title="Especialidad y doctor">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Especialidad" required>
            {(c) => (
              <Select
                value={specialty}
                onChange={(e) =>
                  patch({ specialty: e.target.value as Specialty | '', doctorId: '', typeId: '' })
                }
                {...c}
              >
                <option value="">Elija una especialidad</option>
                {offeredSpecialties.map((s) => (
                  <option key={s} value={s}>
                    {SPECIALTY_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Doctor">
            {(c) => (
              <Select
                value={draft.doctorId}
                disabled={specialty === ''}
                onChange={(e) => patch({ doctorId: e.target.value })}
                {...c}
              >
                <option value="">Cualquiera</option>
                {doctorsForSpecialty.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Step>

      <Step number={3} title="Tipo de cita y duración">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo de cita" required>
            {(c) => (
              <Select
                value={draft.typeId}
                disabled={specialty === ''}
                onChange={(e) => patch({ typeId: e.target.value })}
                {...c}
              >
                <option value="">Elija un tipo</option>
                {typeList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.duration_minutes} min
                  </option>
                ))}
                <option value={MANUAL_DURATION}>Otra duración (manual)</option>
              </Select>
            )}
          </Field>
          {manual && (
            <Field
              label="Duración (minutos)"
              required
              error={manualError}
              hint="Múltiplos de 5, de 5 a 240."
            >
              {(c) => (
                <Input
                  inputMode="numeric"
                  value={draft.manualDuration}
                  onChange={(e) => patch({ manualDuration: e.target.value })}
                  {...c}
                />
              )}
            </Field>
          )}
        </div>
        {duration !== null && !manual && (
          <p className="text-sm text-slate-600">Duración: {duration} min.</p>
        )}
      </Step>

      <Step number={4} title="Fechas y huecos libres">
        <DateRangeFields
          from={draft.fromDate}
          to={draft.toDate}
          onChange={(range) => patch({ fromDate: range.from, toDate: range.to })}
        />
        {missedPrefill && (
          <Alert tone="warning">
            El horario que tocó en el calendario ya no está libre. Elija otro de la lista.
          </Alert>
        )}
        <SlotPicker
          query={query}
          selected={draft.slot}
          onSelect={chooseSlot}
          autoSelect={autoSelect}
          onAutoSelectMissed={() => setMissedPrefill(true)}
        />
        {draft.slot && (
          <p aria-live="polite" className="text-sm font-medium text-brand-700">
            Hueco elegido: {formatDayLong(limaDateKeyOf(draft.slot.startsAt))},{' '}
            {formatTimeLima(draft.slot.startsAt)} con {draft.slot.doctorName}.
          </p>
        )}
      </Step>

      <Step number={5} title="Sala y notas (opcional)">
        <Field label="Sala">
          {(c) => (
            <Select
              value={draft.roomId}
              onChange={(e) => patch({ roomId: e.target.value }, true)}
              {...c}
            >
              <option value="">Sin sala</option>
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Notas administrativas"
          hint="Solo logística (p. ej. «llega con su hija»). No escriba datos clínicos: diagnósticos, síntomas ni tratamientos."
        >
          {(c) => (
            <Textarea
              rows={2}
              maxLength={ADMIN_NOTES_MAX}
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value }, true)}
              {...c}
            />
          )}
        </Field>
      </Step>

      <Step number={6} title="Paquete de sesiones (opcional)">
        <CheckboxField
          label="Agendar un paquete de sesiones a la misma hora"
          checked={draft.seriesEnabled}
          onChange={(e) => patch({ seriesEnabled: e.target.checked }, true)}
        />
        {draft.seriesEnabled && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Cantidad de sesiones"
                hint={`De ${SERIES_MIN_COUNT} a ${SERIES_MAX_COUNT}.`}
                error={
                  isValidSeries(count, 1)
                    ? undefined
                    : `Indique de ${SERIES_MIN_COUNT} a ${SERIES_MAX_COUNT} sesiones.`
                }
              >
                {(c) => (
                  <Input
                    inputMode="numeric"
                    value={draft.seriesCount}
                    onChange={(e) => patch({ seriesCount: e.target.value }, true)}
                    {...c}
                  />
                )}
              </Field>
              <Field
                label="Cada cuántos días"
                hint={`De ${SERIES_MIN_INTERVAL} a ${SERIES_MAX_INTERVAL}.`}
                error={
                  isValidSeries(SERIES_MIN_COUNT, interval)
                    ? undefined
                    : `Indique de ${SERIES_MIN_INTERVAL} a ${SERIES_MAX_INTERVAL} días.`
                }
              >
                {(c) => (
                  <Input
                    inputMode="numeric"
                    value={draft.seriesInterval}
                    onChange={(e) => patch({ seriesInterval: e.target.value }, true)}
                    {...c}
                  />
                )}
              </Field>
            </div>
            {preview.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-slate-800">
                  Fechas previstas (todas a las {preview[0]?.time}, hora de Lima):
                </p>
                <ol
                  aria-label="Sesiones del paquete"
                  className="mt-1 list-decimal pl-6 text-sm text-slate-700"
                >
                  {preview.map((s) => (
                    <li key={s.session}>{formatDayLong(s.dayKey)}</li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Elija un hueco para ver las fechas del paquete.
              </p>
            )}
          </>
        )}
      </Step>

      {mutation.isError && <AgendaError error={mutation.error} title="No se pudo agendar" />}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {draft.slot && patient && (
          <p className="mr-auto text-sm text-slate-700">
            {patient.name} · {formatSlotLima(draft.slot.startsAt, draft.slot.endsAt)}
          </p>
        )}
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={submitting} disabled={!payload || !seriesOk}>
          {draft.seriesEnabled && seriesOk ? `Agendar paquete (${count} sesiones)` : 'Agendar cita'}
        </Button>
      </div>
    </form>
  )
}
