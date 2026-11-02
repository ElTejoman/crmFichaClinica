import { loginSchema } from './schemas'

describe('loginSchema', () => {
  it('acepta correo y contraseña', () => {
    expect(loginSchema.safeParse({ email: ' dueno@clinica-demo.pe ', password: 'x' }).success).toBe(
      true,
    )
  })

  it('pide el correo y la contraseña con mensajes en español', () => {
    const result = loginSchema.safeParse({ email: '', password: '' })
    expect(result.success).toBe(false)
    const messages = result.error?.issues.map((i) => i.message)
    expect(messages).toContain('Ingrese su correo')
    expect(messages).toContain('Ingrese su contraseña')
  })

  it('rechaza un correo mal formado', () => {
    const result = loginSchema.safeParse({ email: 'no-es-correo', password: 'x' })
    expect(result.error?.issues[0]?.message).toBe('Ingrese un correo válido')
  })

  it('no aplica la política de contraseñas (la decide el servidor)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.pe', password: 'x' }).success).toBe(true)
  })
})
