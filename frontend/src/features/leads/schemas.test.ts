import {
  EMPTY_LEAD_VALUES,
  leadFormSchema,
  toLeadCreate,
  toLeadUpdate,
  type LeadFormValues,
} from './schemas'

const valid: LeadFormValues = { ...EMPTY_LEAD_VALUES, full_name: 'Ana Soto', phone: '912345678' }

describe('leadFormSchema', () => {
  it('exige nombre y al menos un teléfono o un correo', () => {
    expect(leadFormSchema.safeParse(valid).success).toBe(true)
    const noContact = leadFormSchema.safeParse({ ...valid, phone: '' })
    expect(noContact.success).toBe(false)
    expect(leadFormSchema.safeParse({ ...valid, full_name: ' ' }).success).toBe(false)
  })

  it('solo el correo también basta; valida formatos', () => {
    expect(leadFormSchema.safeParse({ ...valid, phone: '', email: 'ana@correo.pe' }).success).toBe(
      true,
    )
    expect(leadFormSchema.safeParse({ ...valid, email: 'mal' }).success).toBe(false)
    expect(leadFormSchema.safeParse({ ...valid, phone: '12' }).success).toBe(false)
  })
})

describe('toLeadCreate / toLeadUpdate', () => {
  it('vacíos viajan como null', () => {
    expect(toLeadCreate(valid)).toMatchObject({
      phone: '912345678',
      email: null,
      assigned_to: null,
      notes: null,
      consent_marketing: false,
    })
  })

  it('el PATCH incluye solo lo que cambió (null vacía el campo)', () => {
    const initial = { ...valid, email: 'ana@correo.pe', notes: 'Llamar tarde' }
    expect(toLeadUpdate(initial, { ...initial, email: '', notes: 'Llamar mañana' })).toEqual({
      email: null,
      notes: 'Llamar mañana',
    })
    expect(toLeadUpdate(initial, { ...initial })).toEqual({})
  })

  it('las especialidades se comparan como conjunto (el orden no cuenta)', () => {
    const initial: LeadFormValues = { ...valid, interest_specialties: ['NUTRITION', 'DENTISTRY'] }
    expect(
      toLeadUpdate(initial, { ...initial, interest_specialties: ['DENTISTRY', 'NUTRITION'] }),
    ).toEqual({})
    expect(toLeadUpdate(initial, { ...initial, interest_specialties: ['NUTRITION'] })).toEqual({
      interest_specialties: ['NUTRITION'],
    })
  })
})
