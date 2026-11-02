import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import {
  ALL_PROFESSIONAL_BODIES,
  ALL_SPECIALTIES,
  PROFESSIONAL_BODY_LABELS,
  SPECIALTY_LABELS,
} from '@/shared/lib/labels'
import { ApiError } from '@/shared/lib/http'
import type { Role, UserRead } from '@/shared/types/aliases'
import { Alert, Button, CheckboxGroup, Field, Input, Select } from '@/shared/ui'

import { useCreateUser } from '../api/useUsers'
import {
  createUserSchema,
  EMPTY_CREATE_VALUES,
  toUserCreate,
  type CreateUserValues,
} from '../schemas'
import { RoleCheckboxes } from './RoleCheckboxes'

interface UserCreateFormProps {
  actorRoles: readonly Role[]
  onCreated: (user: UserRead) => void
  onCancel: () => void
}

const WEAK_PASSWORD_CODE = 'weak_password'
const HTTP_CONFLICT = 409

const SPECIALTY_OPTIONS = ALL_SPECIALTIES.map((value) => ({
  value,
  label: SPECIALTY_LABELS[value],
}))

/** Alta de usuario. El bloque de doctor aparece solo si se marca el rol DOCTOR. */
export function UserCreateForm({ actorRoles, onCreated, onCancel }: UserCreateFormProps) {
  const createUser = useCreateUser()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: EMPTY_CREATE_VALUES,
  })
  const isDoctor = useWatch({ control, name: 'roles' }).includes('DOCTOR')

  async function onSubmit(values: CreateUserValues) {
    setServerError(null)
    try {
      onCreated(await createUser.mutateAsync(toUserCreate(values)))
    } catch (error) {
      if (!(error instanceof ApiError)) return setServerError('No se pudo crear el usuario.')
      // Errores atribuibles a un campo se muestran junto al campo; el resto, arriba del formulario.
      if (error.code === WEAK_PASSWORD_CODE) setError('password', { message: error.message })
      else if (error.status === HTTP_CONFLICT) setError('email', { message: error.message })
      else setServerError(error.message)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label="Nuevo usuario"
      className="flex flex-col gap-4 rounded-lg border border-slate-300 bg-white p-5"
    >
      <h2 className="text-lg font-semibold text-slate-900">Nuevo usuario</h2>
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre completo" error={errors.full_name?.message} required>
          {(c) => <Input autoComplete="off" {...c} {...register('full_name')} />}
        </Field>
        <Field label="Correo electrónico" error={errors.email?.message} required>
          {(c) => <Input type="email" autoComplete="off" {...c} {...register('email')} />}
        </Field>
        <Field label="Teléfono" error={errors.phone?.message}>
          {(c) => <Input type="tel" autoComplete="off" {...c} {...register('phone')} />}
        </Field>
        <Field
          label="Contraseña inicial"
          hint="Mínimo 12 caracteres, con letras y números, sin incluir su correo."
          error={errors.password?.message}
          required
        >
          {(c) => (
            <Input type="password" autoComplete="new-password" {...c} {...register('password')} />
          )}
        </Field>
      </div>

      <Controller
        control={control}
        name="roles"
        render={({ field }) => (
          <RoleCheckboxes
            value={field.value}
            onChange={field.onChange}
            actorRoles={actorRoles}
            error={errors.roles?.message}
          />
        )}
      />

      {isDoctor && (
        <fieldset className="flex flex-col gap-4 rounded-md border border-brand-500/40 bg-brand-50 p-4">
          <legend className="px-1 text-sm font-semibold text-brand-700">Perfil de doctor</legend>
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="N.º de colegiatura"
              error={errors.doctor?.license_number?.message}
              required
            >
              {(c) => <Input autoComplete="off" {...c} {...register('doctor.license_number')} />}
            </Field>
            <Field
              label="Colegio profesional"
              error={errors.doctor?.professional_body?.message}
              required
            >
              {(c) => (
                <Select {...c} {...register('doctor.professional_body')}>
                  <option value="">Seleccione…</option>
                  {ALL_PROFESSIONAL_BODIES.map((body) => (
                    <option key={body} value={body}>
                      {PROFESSIONAL_BODY_LABELS[body]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="RNE (opcional)" error={errors.doctor?.rne?.message}>
              {(c) => <Input autoComplete="off" {...c} {...register('doctor.rne')} />}
            </Field>
          </div>
          <Controller
            control={control}
            name="doctor.specialties"
            render={({ field }) => (
              <CheckboxGroup
                legend="Especialidades"
                options={SPECIALTY_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                error={errors.doctor?.specialties?.message}
                required
              />
            )}
          />
        </fieldset>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={createUser.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={createUser.isPending}>
          Crear usuario
        </Button>
      </div>
    </form>
  )
}
