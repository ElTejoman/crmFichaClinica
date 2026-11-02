import type { DoctorAvailability } from '@/shared/types/aliases'

import { groupSlotsByDay } from './availability'

const slot = (startsAt: string, endsAt: string) => ({ starts_at: startsAt, ends_at: endsAt })

const availability: DoctorAvailability[] = [
  {
    doctor_user_id: 'd-2',
    doctor_name: 'Zoila Ramos',
    slots: [slot('2026-11-03T14:00:00Z', '2026-11-03T14:30:00Z')],
  },
  {
    doctor_user_id: 'd-1',
    doctor_name: 'Ana Torres',
    slots: [
      slot('2026-11-04T14:30:00Z', '2026-11-04T15:00:00Z'),
      slot('2026-11-03T14:30:00Z', '2026-11-03T15:00:00Z'),
      slot('2026-11-03T14:00:00Z', '2026-11-03T14:30:00Z'),
    ],
  },
]

describe('groupSlotsByDay', () => {
  it('agrupa por día y luego por doctor, ordenado por fecha, nombre y hora', () => {
    const days = groupSlotsByDay(availability)
    expect(days.map((d) => d.dayKey)).toEqual(['2026-11-03', '2026-11-04'])
    const first = days[0]
    expect(first?.doctors.map((d) => d.doctorName)).toEqual(['Ana Torres', 'Zoila Ramos'])
    expect(first?.doctors[0]?.slots.map((s) => s.starts_at)).toEqual([
      '2026-11-03T14:00:00Z',
      '2026-11-03T14:30:00Z',
    ])
    expect(days[1]?.doctors).toHaveLength(1)
  })

  it('usa el día de Lima: las 20:00 de Lima (01:00Z del día siguiente) siguen en su día', () => {
    const late: DoctorAvailability[] = [
      {
        doctor_user_id: 'd-1',
        doctor_name: 'Ana Torres',
        slots: [slot('2026-11-04T01:00:00Z', '2026-11-04T01:30:00Z')],
      },
    ]
    expect(groupSlotsByDay(late)[0]?.dayKey).toBe('2026-11-03')
  })

  it('sin huecos no hay días', () => {
    expect(groupSlotsByDay([{ doctor_user_id: 'd', doctor_name: 'X', slots: [] }])).toEqual([])
  })
})
