import { documentError, normalizeDocument } from './document'

describe('documentError', () => {
  it('DNI: exactamente 8 dígitos', () => {
    expect(documentError('DNI', '12345678')).toBeNull()
    expect(documentError('DNI', '1234567')).toMatch(/8 dígitos/)
    expect(documentError('DNI', '123456789')).toMatch(/8 dígitos/)
    expect(documentError('DNI', '1234567A')).toMatch(/8 dígitos/)
  })

  it('CE 9-12, pasaporte 6-12 y otro 4-20 caracteres', () => {
    expect(documentError('CE', '123456789')).toBeNull()
    expect(documentError('CE', '12345678')).not.toBeNull()
    expect(documentError('PASSPORT', 'ab1234')).toBeNull()
    expect(documentError('PASSPORT', 'ab123')).not.toBeNull()
    expect(documentError('OTHER', 'AB-12')).toBeNull()
    expect(documentError('OTHER', 'AB1')).not.toBeNull()
  })

  it('normaliza espacios y mayúsculas como el servidor', () => {
    expect(normalizeDocument(' ab 12 34 ')).toBe('AB1234')
    expect(documentError('PASSPORT', 'ab 1234')).toBeNull()
  })
})
