import { z } from 'zod'

/**
 * Login: solo exige que los campos existan y el correo tenga forma válida. NO aplica la
 * política de contraseñas (el servidor decide y no debe revelar nada sobre la cuenta).
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Ingrese su correo').pipe(z.email('Ingrese un correo válido')),
  password: z.string().min(1, 'Ingrese su contraseña'),
})

export type LoginValues = z.infer<typeof loginSchema>
