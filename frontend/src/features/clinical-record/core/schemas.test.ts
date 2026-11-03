import {
  addendumFormSchema,
  conditionFormSchema,
  emptyConsentValues,
  makeConsentFormSchema,
  medicationFormSchema,
  toAllergyCreate,
  toConditionCreate,
  toConsentCreate,
  toMedicationCreate,
  EMPTY_MEDICATION_VALUES,
  type ConsentFormValues,
} from './schemas'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

function consent(overrides: Partial<ConsentFormValues> = {}): ConsentFormValues {
  return { ...emptyConsentValues('Rosa Quispe'), signature_image: PNG, ...overrides }
}

function failedFields(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.success ? [] : (result.error?.issues.map((i) => String(i.path[0])) ?? [])
}

describe('consentimiento', () => {
  it('un adulto firma en pantalla sin relación; sin firma falla', () => {
    const schema = makeConsentFormSchema({ isMinor: false })
    expect(schema.safeParse(consent()).success).toBe(true)
    expect(failedFields(schema.safeParse(consent({ signature_image: '' })))).toEqual([
      'signature_image',
    ])
  })

  it('la firma debe ser un PNG data URL (no cualquier texto)', () => {
    const schema = makeConsentFormSchema({ isMinor: false })
    expect(
      failedFields(schema.safeParse(consent({ signature_image: 'data:image/jpeg;base64,AAAA' }))),
    ).toEqual(['signature_image'])
  })

  it('en un menor la relación con el paciente es obligatoria (apoderado)', () => {
    const schema = makeConsentFormSchema({ isMinor: true })
    expect(failedFields(schema.safeParse(consent()))).toEqual(['signer_relation'])
    expect(schema.safeParse(consent({ signer_relation: 'Madre' })).success).toBe(true)
  })

  it('documento escaneado y verbal no exigen firma en pantalla', () => {
    const schema = makeConsentFormSchema({ isMinor: false })
    expect(
      schema.safeParse(consent({ method: 'PAPER_SCANNED', signature_image: '' })).success,
    ).toBe(true)
    expect(
      schema.safeParse(consent({ method: 'VERBAL_RECORDED', signature_image: '' })).success,
    ).toBe(true)
  })

  it('el nombre de quien firma es obligatorio', () => {
    const schema = makeConsentFormSchema({ isMinor: false })
    expect(failedFields(schema.safeParse(consent({ signed_by_name: '  ' })))).toEqual([
      'signed_by_name',
    ])
  })

  it('toConsentCreate descarta la imagen si el método no es firma en pantalla', () => {
    const body = toConsentCreate(consent({ method: 'PAPER_SCANNED' }))
    expect(body.signature_image).toBeNull()
    expect(toConsentCreate(consent()).signature_image).toBe(PNG)
  })
})

describe('otros formularios clínicos', () => {
  it('medicación: la fecha de fin no puede ser anterior a la de inicio', () => {
    const base = { ...EMPTY_MEDICATION_VALUES, name: 'Ibuprofeno' }
    expect(
      failedFields(
        medicationFormSchema.safeParse({ ...base, since: '2026-05-10', until: '2026-05-01' }),
      ),
    ).toEqual(['until'])
    expect(
      medicationFormSchema.safeParse({ ...base, since: '2026-05-01', until: '2026-05-10' }).success,
    ).toBe(true)
  })

  it('toMedicationCreate manda null en lo vacío', () => {
    expect(
      toMedicationCreate({ ...EMPTY_MEDICATION_VALUES, name: ' Ibuprofeno ', dose: '400 mg' }),
    ).toEqual({
      name: 'Ibuprofeno',
      dose: '400 mg',
      route: null,
      frequency: null,
      since: null,
      until: null,
      prescriber: null,
    })
  })

  it('antecedente: el código CIE-10 es opcional pero, si se escribe, debe ser válido y se normaliza', () => {
    const ok = { kind: 'PERSONAL' as const, icd10_code: 'e119', description: 'Diabetes tipo 2' }
    expect(conditionFormSchema.safeParse(ok).success).toBe(true)
    expect(toConditionCreate(ok).icd10_code).toBe('E11.9')
    expect(failedFields(conditionFormSchema.safeParse({ ...ok, icd10_code: 'zzz' }))).toEqual([
      'icd10_code',
    ])
    expect(toConditionCreate({ ...ok, icd10_code: '' }).icd10_code).toBeNull()
  })

  it('alergia: recorta y manda null en la reacción vacía', () => {
    expect(
      toAllergyCreate({
        substance: ' Penicilina ',
        reaction: ' ',
        severity: 'SEVERE',
        verified: true,
      }),
    ).toEqual({ substance: 'Penicilina', reaction: null, severity: 'SEVERE', verified: true })
  })

  it('adenda: motivo y texto obligatorios', () => {
    expect(failedFields(addendumFormSchema.safeParse({ reason: '', text: '' })).sort()).toEqual([
      'reason',
      'text',
    ])
  })
})
