import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { ApiError } from '@/shared/lib/http'
import { Alert, Button, Field, Input } from '@/shared/ui'

import { loginSchema, type LoginValues } from '../schemas'
import { useAuth } from '../useAuth'

const GENERIC_LOGIN_ERROR = 'No se pudo iniciar sesión. Intente nuevamente.'

/**
 * Formulario de acceso. Muestra el mensaje genérico del servidor en 401 (no revela si el
 * correo existe ni si la cuenta está bloqueada).
 */
export function LoginForm() {
  const { login, notice } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginValues) {
    setServerError(null)
    try {
      await login(values.email, values.password)
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : GENERIC_LOGIN_ERROR)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {notice === 'idle' && (
        <Alert tone="info">Su sesión se cerró por inactividad. Ingrese nuevamente.</Alert>
      )}
      {notice === 'expired' && <Alert tone="info">Su sesión expiró. Ingrese nuevamente.</Alert>}
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <Field label="Correo electrónico" error={errors.email?.message} required>
        {(control) => (
          <Input
            type="email"
            autoComplete="username"
            inputMode="email"
            {...control}
            {...register('email')}
          />
        )}
      </Field>
      <Field label="Contraseña" error={errors.password?.message} required>
        {(control) => (
          <Input
            type="password"
            autoComplete="current-password"
            {...control}
            {...register('password')}
          />
        )}
      </Field>
      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  )
}
