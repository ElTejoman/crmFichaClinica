import { attachmentUploadSchema, formatFileSize, MAX_ATTACHMENT_BYTES } from './attachments'

function fileOf(size: number, type: string, name = 'a.pdf'): File {
  return new File([new Uint8Array(size)], name, { type })
}

function messages(input: { file: File; kind: 'LAB' | 'PHOTO'; hasPatientConsent: boolean }) {
  const result = attachmentUploadSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((i) => i.message)
}

describe('attachmentUploadSchema', () => {
  it('acepta un PDF dentro del límite', () => {
    expect(
      messages({ file: fileOf(1024, 'application/pdf'), kind: 'LAB', hasPatientConsent: false }),
    ).toEqual([])
  })

  it('rechaza más de 10 MB (y acepta exactamente 10 MB)', () => {
    expect(
      messages({
        file: fileOf(MAX_ATTACHMENT_BYTES + 1, 'application/pdf'),
        kind: 'LAB',
        hasPatientConsent: false,
      }),
    ).toEqual([expect.stringContaining('el máximo es 10,0 MB')])
    expect(
      messages({
        file: fileOf(MAX_ATTACHMENT_BYTES, 'application/pdf'),
        kind: 'LAB',
        hasPatientConsent: false,
      }),
    ).toEqual([])
  })

  it('rechaza tipos fuera de PDF/PNG/JPEG/WEBP y archivos vacíos', () => {
    expect(
      messages({
        file: fileOf(10, 'application/x-msdownload', 'a.exe'),
        kind: 'LAB',
        hasPatientConsent: false,
      }),
    ).toEqual(['Solo se admiten archivos PDF, PNG, JPEG o WEBP'])
    expect(
      messages({ file: fileOf(0, 'image/png', 'a.png'), kind: 'LAB', hasPatientConsent: false }),
    ).toEqual(['El archivo está vacío'])
  })

  it('las fotografías exigen marcar el consentimiento del paciente', () => {
    const file = fileOf(10, 'image/jpeg', 'foto.jpg')
    expect(messages({ file, kind: 'PHOTO', hasPatientConsent: false })).toEqual([
      'Las fotografías exigen que el paciente haya dado su consentimiento',
    ])
    expect(messages({ file, kind: 'PHOTO', hasPatientConsent: true })).toEqual([])
  })

  it('sin archivo pide elegir uno', () => {
    const result = attachmentUploadSchema.safeParse({ kind: 'LAB', hasPatientConsent: false })
    expect(result.success).toBe(false)
  })
})

describe('formatFileSize', () => {
  it('usa B, KB y MB con coma decimal', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1_572_864)).toBe('1,5 MB')
  })
})
