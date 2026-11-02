import { makeAppointment } from '@/test/appointments'

import { splitDoctorDay } from './doctorDay'

describe('splitDoctorDay', () => {
  it('separa en atención, cola (por orden de llegada) y resto (por hora), sin canceladas', () => {
    const day = splitDoctorDay([
      makeAppointment({ id: 'late', status: 'SCHEDULED', starts_at: '2026-11-03T20:00:00Z' }),
      makeAppointment({
        id: 'q2',
        status: 'CHECKED_IN',
        starts_at: '2026-11-03T15:00:00Z',
        checked_in_at: '2026-11-03T14:50:00Z',
      }),
      makeAppointment({
        id: 'q1',
        status: 'CHECKED_IN',
        starts_at: '2026-11-03T16:00:00Z',
        checked_in_at: '2026-11-03T14:40:00Z',
      }),
      makeAppointment({ id: 'now', status: 'IN_PROGRESS' }),
      makeAppointment({ id: 'done', status: 'COMPLETED', starts_at: '2026-11-03T13:00:00Z' }),
      makeAppointment({ id: 'gone', status: 'CANCELLED' }),
      makeAppointment({ id: 'ns', status: 'NO_SHOW' }),
    ])
    expect(day.inProgress.map((a) => a.id)).toEqual(['now'])
    expect(day.queue.map((a) => a.id)).toEqual(['q1', 'q2'])
    expect(day.rest.map((a) => a.id)).toEqual(['done', 'late'])
  })
})
