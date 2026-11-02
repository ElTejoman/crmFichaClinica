import {
  EMPTY_PATIENT_VALUES,
  makePatientFormSchema,
  toPatientCreate,
  toPatientUpdate,
  type PatientFormValues,
} from './schemas'

const TODAY = '2026-06-15'
const schema = makePatientFormSchema('create', () => TODAY)

const adult: PatientFormValues = {
  ...EMPTY_PATIENT_VALUES,
  document_number: '90001234',
  first_name: 'Rosa',
  last_name: 'Quispe',
  birth_date: '1990-05-01',
  sex: 'FEMALE',
  data_processing_consent: true,
}

function issuesOf(values: PatientFormValues): Record<string, string> {
  const result = schema.safeParse(values)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('esquema de paciente (alta)', () => {
  it('un adulto con los datos mínimos es válido', () => {
    expect(issuesOf(adult)).toEqual({})
  })

  it('el consentimiento es obligatorio (Ley 29733)', () => {
    expect(issuesOf({ ...adult, data_processing_consent: false })).toHaveProperty(
      'data_processing_consent',
    )
  })

  it('DNI con menos o más de 8 dígitos es inválido', () => {
    expect(issuesOf({ ...adult, document_number: '1234567' }).document_number).toMatch(/8 dígitos/)
    expect(issuesOf({ ...adult, document_number: '123456789' }).document_number).toMatch(
      /8 dígitos/,
    )
    expect(issuesOf({ ...adult, document_number: '' }).document_number).toBeDefined()
  })

  it('exige fecha de nacimiento válida, no futura y plausible', () => {
    expect(issuesOf({ ...adult, birth_date: '' }).birth_date).toBeDefined()
    expect(issuesOf({ ...adult, birth_date: '2027-01-01' }).birth_date).toMatch(/futura/)
    expect(issuesOf({ ...adult, birth_date: '1800-01-01' }).birth_date).toMatch(/plausible/)
    expect(issuesOf({ ...adult, birth_date: '2026-02-30' }).birth_date).toBeDefined()
  })

  it('exige sexo, y valida teléfono y correo solo si se escriben', () => {
    expect(issuesOf({ ...adult, sex: '' }).sex).toBeDefined()
    expect(issuesOf({ ...adult, phone: '123' }).phone).toBeDefined()
    expect(issuesOf({ ...adult, email: 'no-es-correo' }).email).toBeDefined()
    expect(issuesOf({ ...adult, phone: '912345678', email: 'a@b.pe' })).toEqual({})
  })

  it('el apoderado es OBLIGATORIO si el paciente es menor de 18 años', () => {
    const minor = { ...adult, birth_date: '2012-03-01' }
    const issues = issuesOf(minor)
    expect(issues).toHaveProperty(['guardian.name'])
    expect(issues).toHaveProperty(['guardian.document_number'])
    expect(issues).toHaveProperty(['guardian.phone'])
    expect(issues).toHaveProperty(['guardian.relation'])
  })

  it('un menor con apoderado completo es válido; el DNI del apoderado también se valida', () => {
    const guardian = {
      name: 'Luz Quispe',
      document_type: 'DNI' as const,
      document_number: '40123456',
      phone: '912345678',
      relation: 'Madre',
    }
    const minor = { ...adult, birth_date: '2012-03-01', guardian }
    expect(issuesOf(minor)).toEqual({})
    expect(issuesOf({ ...minor, guardian: { ...guardian, document_number: '12' } })).toHaveProperty(
      ['guardian.document_number'],
    )
  })

  it('un adulto NO necesita apoderado; justo el día que cumple 18 deja de ser menor', () => {
    expect(issuesOf({ ...adult, birth_date: '2008-06-15' })).toEqual({})
    expect(issuesOf({ ...adult, birth_date: '2008-06-16' })).toHaveProperty(['guardian.name'])
  })

  it('el contacto de emergencia es opcional, pero si se empieza debe ser completo', () => {
    const partial = { ...adult, emergency_contact: { name: 'Pedro', phone: '', relation: '' } }
    expect(issuesOf(partial)).toHaveProperty(['emergency_contact.phone'])
    expect(
      issuesOf({
        ...adult,
        emergency_contact: { name: 'Pedro', phone: '912345678', relation: '' },
      }),
    ).toEqual({})
  })

  it('en edición no se exige documento ni consentimiento', () => {
    const edit = makePatientFormSchema('edit', () => TODAY)
    expect(
      edit.safeParse({ ...adult, document_number: '', data_processing_consent: false }).success,
    ).toBe(true)
  })
})

describe('toPatientCreate', () => {
  it('los textos vacíos viajan como null y el contacto/apoderado vacíos como null', () => {
    const payload = toPatientCreate(adult)
    expect(payload).toMatchObject({
      document_type: 'DNI',
      document_number: '90001234',
      sex: 'FEMALE',
      marital_status: null,
      phone: null,
      email: null,
      referral_source: null,
      emergency_contact: null,
      guardian: null,
      data_processing_consent: true,
    })
  })

  it('incluye apoderado y contacto de emergencia cuando existen', () => {
    const payload = toPatientCreate({
      ...adult,
      emergency_contact: { name: 'Pedro', phone: '912345678', relation: 'Hermano' },
      guardian: {
        name: 'Luz',
        document_type: 'DNI',
        document_number: '40123456',
        phone: '912345678',
        relation: 'Madre',
      },
    })
    expect(payload.emergency_contact).toEqual({
      name: 'Pedro',
      phone: '912345678',
      relation: 'Hermano',
    })
    expect(payload.guardian?.relation).toBe('Madre')
  })
})

describe('toPatientUpdate', () => {
  it('sin cambios no envía nada', () => {
    expect(toPatientUpdate(adult, { ...adult })).toEqual({})
  })

  it('envía SOLO los campos que cambiaron, y null para vaciar', () => {
    const initial = { ...adult, phone: '+51912345678', district: 'Miraflores' }
    const changes = toPatientUpdate(initial, { ...initial, phone: '+51987654321', district: '' })
    expect(changes).toEqual({ phone: '+51987654321', district: null })
  })

  it('detecta cambios en el apoderado y en el contacto de emergencia', () => {
    const changes = toPatientUpdate(adult, {
      ...adult,
      emergency_contact: { name: 'Pedro', phone: '912345678', relation: '' },
    })
    expect(Object.keys(changes)).toEqual(['emergency_contact'])
  })

  it('nunca incluye documento ni consentimiento', () => {
    const changes = toPatientUpdate(adult, {
      ...adult,
      document_number: '11111111',
      first_name: 'Ana',
    })
    expect(changes).toEqual({ first_name: 'Ana' })
  })
})
