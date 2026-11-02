import { useDoctors } from '@/entities/doctor'
import { ALL_SPECIALTIES, SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { Specialty } from '@/shared/types/aliases'
import { CheckboxField, Field, Select } from '@/shared/ui'

import { useRooms } from '../api/useBooking'
import type { AgendaParams } from '../agendaParams'

/**
 * Filtros de la agenda. Un doctor sin permisos de gestión no ve el filtro de doctor: el
 * servidor ya le entrega solo sus citas.
 */
export function AgendaFilters({
  params,
  onChange,
  showDoctorFilter,
}: {
  params: AgendaParams
  onChange: (changes: Partial<AgendaParams>) => void
  showDoctorFilter: boolean
}) {
  const doctors = useDoctors()
  const rooms = useRooms()
  return (
    <div
      className="flex flex-wrap items-end gap-x-4 gap-y-3"
      role="group"
      aria-label="Filtros de la agenda"
    >
      {showDoctorFilter && (
        <div className="w-full sm:w-52">
          <Field label="Doctor">
            {(c) => (
              <Select
                value={params.doctorId}
                onChange={(e) => onChange({ doctorId: e.target.value })}
                {...c}
              >
                <option value="">Todos</option>
                {(doctors.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      )}
      <div className="w-full sm:w-44">
        <Field label="Especialidad">
          {(c) => (
            <Select
              value={params.specialty}
              onChange={(e) => onChange({ specialty: e.target.value as Specialty | '' })}
              {...c}
            >
              <option value="">Todas</option>
              {ALL_SPECIALTIES.map((s) => (
                <option key={s} value={s}>
                  {SPECIALTY_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="w-full sm:w-44">
        <Field label="Sala">
          {(c) => (
            <Select
              value={params.roomId}
              onChange={(e) => onChange({ roomId: e.target.value })}
              {...c}
            >
              <option value="">Todas</option>
              {(rooms.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="pb-2">
        <CheckboxField
          label="Mostrar canceladas y ausencias"
          checked={params.showReleased}
          onChange={(e) => onChange({ showReleased: e.target.checked })}
        />
      </div>
    </div>
  )
}
