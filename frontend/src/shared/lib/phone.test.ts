import { isValidPhone } from './phone'

describe('isValidPhone', () => {
  it('acepta celular peruano e internacional con +', () => {
    expect(isValidPhone('912345678')).toBe(true)
    expect(isValidPhone('+51 912 345 678')).toBe(true)
    expect(isValidPhone('+1 (415) 555-0100')).toBe(true)
  })

  it('rechaza muy corto, muy largo o con letras', () => {
    expect(isValidPhone('12345')).toBe(false)
    expect(isValidPhone('1234567890123456')).toBe(false)
    expect(isValidPhone('abc123456')).toBe(false)
  })
})
