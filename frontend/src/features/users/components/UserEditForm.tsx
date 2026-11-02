import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { ApiError } from '@/shared/lib/http'
import type { Role, UserRead } from '@/shared/types/aliases'
import { Alert, Button, Field, Input } from '@/shared/ui'

import { useUpdateUser } from '../api/useUsers'
import { editUserSchema, toUserUpdate, type EditUserValues } from '../schemas'
import { RoleCheckboxes } from './RoleCheckboxes'

interface UserEditFormProps {
  user: UserRead
  actorRoles: readonly Role[]
  onSaved: (user: UserRead) => void
  onCancel: () => void
}

/** Edición de nombre, teléfono y roles. El perfil de doctor no es editable con el API actual. */
export function UserEditForm({ user, actorRoles, onSaved, onCancel }: UserEditFormProps) {
  const updateUser = useUpdateUser()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { full_name: user.full_name, phone: user.phone ?? '', roles: user.roles },
  })

  async function onSubmit(values: EditUserValues) {
    setServerError(null)
    try {
      onSaved(await updateUser.mutateAsync({ id: user.id, changes: toUserUpdate(values) }))
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'No se pudo guardar los cambios.')
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label={`Editar a ${user.full_name}`}
      className="flex flex-col gap-4 rounded-lg border border-slate-300 bg-white p-5"
    >
      <h2 className="text-lg font-semibold text-slate-900">Editar usuario</h2>
      <p className="text-sm text-slate-600">{user.email}</p>
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre completo" error={errors.full_name?.message} required>
          {(c) => <Input autoComplete="off" {...c} {...register('full_name')} />}
        </Field>
        <Field label="Teléfono" error={errors.phone?.message}>
          {(c) => <Input type="tel" autoComplete="off" {...c} {...register('phone')} />}
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
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={updateUser.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={updateUser.isPending}>
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}
