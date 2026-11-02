import {
  exceptionFormSchema,
  roomFormSchema,
  scheduleFormSchema,
  toExceptionCreate,
  toWorkingBlockCreate,
  typeFormSchema,
  EMPTY_SCHEDULE_VALUES,
} from './schemas'

describe('scheduleFormSchema', () => {
  it('acepta un bloque válido y lo convierte al formato del API (HH:MM:SS)', () => {
    expect(scheduleFormSchema.safeParse(EMPTY_SCHEDULE_VALUES).success).toBe(true)
    expect(toWorkingBlockCreate('d-1', EMPTY_SCHEDULE_VALUES)).toEqual({
      doctor_user_id: 'd-1',
      weekday: 0,
      start_time: '09:00:00',
      end_time: '13:00:00',
      slot_minutes: 30,
      valid_from: null,
      valid_to: null,
    })
  })

  it('la hora de fin debe ser posterior a la de inicio', () => {
    const result = scheduleFormSchema.safeParse({ ...EMPTY_SCHEDULE_VALUES, end_time: '09:00' })
    expect(result.success).toBe(false)
  })

  it('minutos por cita: múltiplos de 5 entre 5 y 240', () => {
    for (const bad of ['0', '7', '245', 'x']) {
      expect(
        scheduleFormSchema.safeParse({ ...EMPTY_SCHEDULE_VALUES, slot_minutes: bad }).success,
      ).toBe(false)
    }
  })

  it('la vigencia no puede terminar antes de empezar', () => {
    const result = scheduleFormSchema.safeParse({
      ...EMPTY_SCHEDULE_VALUES,
      valid_from: '2026-12-01',
      valid_to: '2026-11-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('exceptionFormSchema', () => {
  const base = {
    doctor_user_id: '',
    start_date: '2026-11-10',
    end_date: '2026-11-10',
    reason: 'Feriado',
  }

  it('toda la clínica = doctor null', () => {
    expect(exceptionFormSchema.safeParse(base).success).toBe(true)
    expect(toExceptionCreate(base).doctor_user_id).toBeNull()
  })

  it('exige motivo y rango coherente', () => {
    expect(exceptionFormSchema.safeParse({ ...base, reason: '  ' }).success).toBe(false)
    expect(exceptionFormSchema.safeParse({ ...base, end_date: '2026-11-09' }).success).toBe(false)
  })
})

describe('roomFormSchema y typeFormSchema', () => {
  it('sala: nombre obligatorio', () => {
    expect(roomFormSchema.safeParse({ name: ' ', specialties: [], is_active: true }).success).toBe(
      false,
    )
    expect(
      roomFormSchema.safeParse({ name: 'Sala 1', specialties: [], is_active: true }).success,
    ).toBe(true)
  })

  it('tipo: especialidad, nombre y duración válida', () => {
    const ok = {
      specialty: 'ACUPUNCTURE',
      name: 'Control',
      duration_minutes: '30',
      is_active: true,
    }
    expect(typeFormSchema.safeParse(ok).success).toBe(true)
    expect(typeFormSchema.safeParse({ ...ok, specialty: '' }).success).toBe(false)
    expect(typeFormSchema.safeParse({ ...ok, duration_minutes: '33' }).success).toBe(false)
  })
})
