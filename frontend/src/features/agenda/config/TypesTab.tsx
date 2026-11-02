import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { ALL_SPECIALTIES, SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { AppointmentTypeRead, Specialty } from '@/shared/types/aliases'
import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  Dialog,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from '@/shared/ui'

import {
  useAllAppointmentTypes,
  useCreateAppointmentType,
  useUpdateAppointmentType,
} from '../api/useScheduleConfig'
import { AgendaError } from '../components/AgendaError'
import { EMPTY_TYPE_VALUES, toTypeCreate, typeFormSchema, type TypeFormValues } from '../schemas'
import { mapConfigError } from './formHelpers'

function TypeForm({
  initialValues,
  isEdit,
  onSubmit,
  onCancel,
}: {
  initialValues: TypeFormValues
  isEdit: boolean
  onSubmit: (values: TypeFormValues) => Promise<void>
  onCancel: () => void
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TypeFormValues>({
    resolver: zodResolver(typeFormSchema),
    defaultValues: initialValues,
  })
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(values: TypeFormValues) {
    setFormError(null)
    try {
      await onSubmit(values)
    } catch (error) {
      const mapped = mapConfigError(error)
      if (mapped.field === 'name') setError('name', { message: mapped.message })
      else setFormError(mapped.message)
    }
  }

  return (
    <form
      noValidate
      aria-label={isEdit ? 'Editar tipo de cita' : 'Nuevo tipo de cita'}
      onSubmit={(event) => void handleSubmit(submit)(event)}
      className="flex flex-col gap-4"
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field
        label="Especialidad"
        error={errors.specialty?.message}
        hint={isEdit ? 'La especialidad no se puede cambiar: cree otro tipo.' : undefined}
        required
      >
        {(c) => (
          <Select disabled={isEdit} {...register('specialty')} {...c}>
            <option value="">Elija una especialidad</option>
            {ALL_SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {SPECIALTY_LABELS[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Nombre" error={errors.name?.message} required>
        {(c) => <Input autoComplete="off" maxLength={80} {...register('name')} {...c} />}
      </Field>
      <Field
        label="Duración (minutos)"
        error={errors.duration_minutes?.message}
        hint="Múltiplos de 5, de 5 a 240."
        required
      >
        {(c) => <Input inputMode="numeric" {...register('duration_minutes')} {...c} />}
      </Field>
      {isEdit && <CheckboxField label="Tipo activo" {...register('is_active')} />}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {isEdit ? 'Guardar cambios' : 'Crear tipo'}
        </Button>
      </div>
    </form>
  )
}

/** Tipos de cita por especialidad (con su duración por defecto). */
export function TypesTab() {
  const [filter, setFilter] = useState<Specialty | ''>('')
  const types = useAllAppointmentTypes(filter)
  const create = useCreateAppointmentType()
  const update = useUpdateAppointmentType()
  const [editing, setEditing] = useState<AppointmentTypeRead | 'new' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function save(values: TypeFormValues) {
    if (editing === 'new') {
      await create.mutateAsync(toTypeCreate(values))
      setMessage('Tipo de cita creado.')
    } else if (editing) {
      await update.mutateAsync({
        id: editing.id,
        changes: {
          name: values.name.trim(),
          duration_minutes: Number(values.duration_minutes),
          is_active: values.is_active,
        },
      })
      setMessage('Tipo de cita actualizado.')
    }
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Field label="Filtrar por especialidad">
            {(c) => (
              <Select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Specialty | '')}
                {...c}
              >
                <option value="">Todas</option>
                {ALL_SPECIALTIES.map((s) => (
                  <option key={s} value={s}>
                    {SPECIALTY_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button
          onClick={() => {
            setMessage(null)
            setEditing('new')
          }}
        >
          Nuevo tipo de cita
        </Button>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {message && <Alert tone="success">{message}</Alert>}
      </div>
      {types.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando tipos…
        </p>
      )}
      {types.isError && <AgendaError error={types.error} />}
      {types.data &&
        (types.data.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
            No hay tipos de cita para este filtro.
          </p>
        ) : (
          <Table caption="Tipos de cita">
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th>Especialidad</Th>
                <Th>Duración</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {types.data.map((type) => (
                <tr key={type.id}>
                  <Td className="font-medium">{type.name}</Td>
                  <Td>{SPECIALTY_LABELS[type.specialty]}</Td>
                  <Td>{type.duration_minutes} min</Td>
                  <Td>
                    {type.is_active ? (
                      <Badge tone="success" icon="●">
                        Activo
                      </Badge>
                    ) : (
                      <Badge tone="neutral" icon="○">
                        Inactivo
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    <Button
                      variant="secondary"
                      className="min-h-8 px-2.5 py-1 text-xs"
                      aria-label={`Editar tipo ${type.name}`}
                      onClick={() => {
                        setMessage(null)
                        setEditing(type)
                      }}
                    >
                      Editar
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nuevo tipo de cita' : 'Editar tipo de cita'}
      >
        {editing !== null && (
          <TypeForm
            isEdit={editing !== 'new'}
            initialValues={
              editing === 'new'
                ? { ...EMPTY_TYPE_VALUES, specialty: filter }
                : {
                    specialty: editing.specialty,
                    name: editing.name,
                    duration_minutes: String(editing.duration_minutes),
                    is_active: editing.is_active,
                  }
            }
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  )
}
