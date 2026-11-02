import { z } from 'zod'

/**
 * Espejo de la política del servidor (backend/app/domain/password_policy.py) solo para dar
 * retroalimentación inmediata; el servidor decide siempre (puede rechazar contraseñas comunes).
 */
export const MIN_PASSWORD_LENGTH = 12
const MIN_LOCAL_PART_LENGTH = 4

export function passwordProblems(password: string, email = ''): string[] {
  const problems: string[] = []
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  }
  if (!/\p{L}/u.test(password)) problems.push('Debe incluir al menos una letra')
  if (!/\p{Nd}/u.test(password)) problems.push('Debe incluir al menos un número')
  const localPart = (email.split('@')[0] ?? '').toLowerCase()
  if (localPart.length >= MIN_LOCAL_PART_LENGTH && password.toLowerCase().includes(localPart)) {
    problems.push('No debe contener la parte local de su correo')
  }
  return problems
}

/**
 * Agrega UN issue sobre `password` con todos los problemas: React Hook Form muestra solo el
 * primer error por campo, así la persona ve de una vez todo lo que falta.
 */
export function addPasswordIssues(password: string, email: string, ctx: z.RefinementCtx): void {
  const problems = passwordProblems(password, email)
  if (problems.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: `${problems.join('. ')}.` })
  }
}
