import { ApiError } from '@/shared/lib/http'

import { describeAgendaError } from './serverErrors'

describe('describeAgendaError', () => {
  it('409 appointment_overlap: dice qué recurso choca y cuándo (hora de Lima)', () => {
    const error = new ApiError(409, 'appointment_overlap', 'Conflicto', {
      details: {
        resource: 'doctor',
        conflicts: [
          {
            resource: 'doctor',
            starts_at: '2026-11-03T14:00:00Z',
            ends_at: '2026-11-03T14:30:00Z',
          },
        ],
      },
    })
    const view = describeAgendaError(error)
    expect(view.message).toBe('El doctor ya tiene una cita que se cruza con ese horario.')
    expect(view.items).toEqual(['Doctor: mar 03/11 · 09:00–09:30'])
  })

  it('si chocan varios recursos a la vez, lo dice en conjunto y lista cada choque', () => {
    const view = describeAgendaError(
      new ApiError(409, 'appointment_overlap', 'x', {
        details: {
          resource: 'patient',
          conflicts: [
            {
              resource: 'patient',
              starts_at: '2026-11-04T14:00:00Z',
              ends_at: '2026-11-04T15:00:00Z',
            },
            {
              resource: 'doctor',
              starts_at: '2026-11-04T14:30:00Z',
              ends_at: '2026-11-04T15:15:00Z',
            },
          ],
        },
      }),
    )
    expect(view.message).toBe('Ese horario choca con otras citas (paciente y doctor).')
    expect(view.items).toEqual([
      'Paciente: mié 04/11 · 09:00–10:00',
      'Doctor: mié 04/11 · 09:30–10:15',
    ])
  })

  it('distingue sala y paciente', () => {
    const room = describeAgendaError(
      new ApiError(409, 'appointment_overlap', 'x', { details: { resource: 'room' } }),
    )
    expect(room.message).toMatch(/sala/i)
    const patient = describeAgendaError(
      new ApiError(409, 'appointment_overlap', 'x', { details: { resource: 'patient' } }),
    )
    expect(patient.message).toMatch(/paciente/i)
  })

  it('422 series_invalid: lista TODAS las sesiones problemáticas', () => {
    const error = new ApiError(422, 'series_invalid', 'Serie inválida', {
      details: {
        sessions: [
          {
            session: 2,
            starts_at: '2026-11-10T14:00:00Z',
            code: 'doctor_unavailable',
            message: 'El doctor no atiende: Feriado',
          },
          {
            session: 4,
            starts_at: '2026-11-24T14:00:00Z',
            code: 'appointment_overlap',
            message: 'Choca con otra cita',
          },
        ],
      },
    })
    const view = describeAgendaError(error)
    expect(view.message).toContain('2 sesiones tienen problemas')
    expect(view.message).toContain('No se creó ninguna')
    expect(view.items).toEqual([
      'Sesión 2 (mar 10/11 09:00): El doctor no atiende: Feriado',
      'Sesión 4 (mar 24/11 09:00): Choca con otra cita',
    ])
  })

  it('403 y errores desconocidos son legibles', () => {
    expect(describeAgendaError(new ApiError(403, 'permission_denied', 'no')).message).toMatch(
      /permiso/,
    )
    expect(
      describeAgendaError(new ApiError(422, 'outside_working_hours', 'Fuera de horario')),
    ).toEqual({
      message: 'Fuera de horario',
      items: [],
    })
    expect(describeAgendaError(new Error('boom')).message).toMatch(/conexión/)
  })
})
