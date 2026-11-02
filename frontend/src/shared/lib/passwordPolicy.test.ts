import { passwordProblems } from './passwordPolicy'

describe('passwordProblems (espejo de la política del servidor)', () => {
  it('acepta una contraseña válida', () => {
    expect(passwordProblems('Demo-Clinica-2026!', 'dueno@clinica-demo.pe')).toEqual([])
  })

  it('exige al menos 12 caracteres', () => {
    expect(passwordProblems('Corta1')).toContain('Debe tener al menos 12 caracteres')
  })

  it('exige una letra y un número', () => {
    expect(passwordProblems('123456789012345')).toContain('Debe incluir al menos una letra')
    expect(passwordProblems('abcdefghijklmnop')).toContain('Debe incluir al menos un número')
  })

  it('rechaza contener la parte local del correo si tiene ≥4 caracteres', () => {
    expect(passwordProblems('xxdueno12345xx', 'dueno@clinica.pe')).toContain(
      'No debe contener la parte local de su correo',
    )
  })

  it('ignora la parte local si es corta (<4)', () => {
    expect(passwordProblems('xxana12345678xx', 'ana@clinica.pe')).toEqual([])
  })
})
