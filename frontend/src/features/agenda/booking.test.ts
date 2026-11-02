import { addDaysToKey } from '@/shared/lib/dates'
import type { AppointmentTypeRead, RoomRead } from '@/shared/types/aliases'

import {
  availabilityQuery,
  buildAppointmentPayload,
  buildSeriesPayload,
  emptyDraft,
  MANUAL_DURATION,
  parseManualDuration,
  rangeError,
  roomsFor,
  type BookingDraft,
} from './booking'

const types: AppointmentTypeRead[] = [
  { id: 't-1', specialty: 'ACUPUNCTURE', name: 'Control', duration_minutes: 30, is_active: true },
]

function draft(overrides: Partial<BookingDraft> = {}): BookingDraft {
  return {
    ...emptyDraft('2026-11-03', addDaysToKey),
    patientId: 'p-1',
    specialty: 'ACUPUNCTURE',
    typeId: 't-1',
    slot: {
      doctorId: 'd-1',
      doctorName: 'Ana Torres',
      startsAt: '2026-11-03T14:00:00Z',
      endsAt: '2026-11-03T14:30:00Z',
    },
    ...overrides,
  }
}

describe('rangeError', () => {
  it('acepta hasta 14 días (inclusive) y rechaza más', () => {
    expect(rangeError('2026-11-03', '2026-11-16')).toBeNull()
    expect(rangeError('2026-11-03', '2026-11-17')).toMatch(/14 días/)
  })

  it('rechaza rangos invertidos o fechas vacías', () => {
    expect(rangeError('2026-11-05', '2026-11-03')).toMatch(/anterior/)
    expect(rangeError('', '2026-11-03')).toMatch(/Indique/)
  })
})

describe('parseManualDuration', () => {
  it('acepta múltiplos de 5 entre 5 y 240', () => {
    expect(parseManualDuration('45')).toBe(45)
    expect(parseManualDuration('240')).toBe(240)
    expect(parseManualDuration('42')).toBeNull()
    expect(parseManualDuration('0')).toBeNull()
    expect(parseManualDuration('245')).toBeNull()
    expect(parseManualDuration('abc')).toBeNull()
  })
})

describe('availabilityQuery', () => {
  it('con doctor elegido consulta por doctor_id y por tipo', () => {
    const query = availabilityQuery(draft({ doctorId: 'd-1' }), types)
    const params = new URLSearchParams(query ?? '')
    expect(params.get('doctor_id')).toBe('d-1')
    expect(params.get('specialty')).toBeNull()
    expect(params.get('appointment_type_id')).toBe('t-1')
    expect(params.get('from_date')).toBe('2026-11-03')
    expect(params.get('to_date')).toBe('2026-11-09')
  })

  it('"cualquiera" consulta por especialidad; duración manual va como minutos', () => {
    const query = availabilityQuery(
      draft({ doctorId: '', typeId: MANUAL_DURATION, manualDuration: '45' }),
      types,
    )
    const params = new URLSearchParams(query ?? '')
    expect(params.get('specialty')).toBe('ACUPUNCTURE')
    expect(params.get('doctor_id')).toBeNull()
    expect(params.get('duration_minutes')).toBe('45')
    expect(params.get('appointment_type_id')).toBeNull()
  })

  it('no busca sin especialidad, sin duración o con rango inválido', () => {
    expect(availabilityQuery(draft({ specialty: '' }), types)).toBeNull()
    expect(availabilityQuery(draft({ typeId: '' }), types)).toBeNull()
    expect(availabilityQuery(draft({ toDate: '2027-01-01' }), types)).toBeNull()
  })
})

describe('payloads', () => {
  it('cita: instante con zona (Z), doctor del hueco elegido y notas recortadas', () => {
    const payload = buildAppointmentPayload(
      draft({ notes: '  Llega con su hija ', roomId: 'r-1' }),
      types,
    )
    expect(payload).toEqual({
      patient_id: 'p-1',
      doctor_user_id: 'd-1',
      specialty: 'ACUPUNCTURE',
      starts_at: '2026-11-03T14:00:00.000Z',
      duration_minutes: null,
      appointment_type_id: 't-1',
      room_id: 'r-1',
      admin_notes: 'Llega con su hija',
    })
  })

  it('un hueco sin zona en el ISO igual se envía con zona', () => {
    const payload = buildAppointmentPayload(
      draft({
        slot: {
          doctorId: 'd-1',
          doctorName: 'A',
          startsAt: '2026-11-03T14:00:00',
          endsAt: '2026-11-03T14:30:00',
        },
      }),
      types,
    )
    expect(payload?.starts_at).toMatch(/Z$/)
  })

  it('sin paciente o sin hueco no hay payload', () => {
    expect(buildAppointmentPayload(draft({ patientId: '' }), types)).toBeNull()
    expect(buildAppointmentPayload(draft({ slot: null }), types)).toBeNull()
  })

  it('serie: añade cantidad e intervalo válidos', () => {
    const payload = buildSeriesPayload(draft({ seriesCount: '4', seriesInterval: '7' }), types)
    expect(payload?.count).toBe(4)
    expect(payload?.interval_days).toBe(7)
    expect(buildSeriesPayload(draft({ seriesCount: '1' }), types)).toBeNull()
  })
})

describe('roomsFor', () => {
  const room = (id: string, specialties: RoomRead['specialties'], active = true): RoomRead => ({
    id,
    name: id,
    specialties,
    is_active: active,
  })

  it('solo salas activas aptas; lista vacía sirve para cualquier especialidad', () => {
    const rooms = [
      room('any', []),
      room('acu', ['ACUPUNCTURE']),
      room('den', ['DENTISTRY']),
      room('off', [], false),
    ]
    expect(roomsFor(rooms, 'ACUPUNCTURE').map((r) => r.id)).toEqual(['any', 'acu'])
  })
})
