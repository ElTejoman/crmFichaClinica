import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { ALL_SPECIALTIES, SPECIALTY_LABELS } from '@/shared/lib/labels'
import type { RoomRead } from '@/shared/types/aliases'
import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  CheckboxGroup,
  Dialog,
  Field,
  Input,
  Spinner,
  Table,
  Td,
  Th,
} from '@/shared/ui'

import { useAllRooms, useCreateRoom, useUpdateRoom } from '../api/useScheduleConfig'
import { AgendaError } from '../components/AgendaError'
import { EMPTY_ROOM_VALUES, roomFormSchema, toRoomCreate, type RoomFormValues } from '../schemas'
import { mapConfigError } from './formHelpers'

const SPECIALTY_OPTIONS = ALL_SPECIALTIES.map((value) => ({
  value,
  label: SPECIALTY_LABELS[value],
}))

function RoomForm({
  initialValues,
  isEdit,
  onSubmit,
  onCancel,
}: {
  initialValues: RoomFormValues
  isEdit: boolean
  onSubmit: (values: RoomFormValues) => Promise<void>
  onCancel: () => void
}) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RoomFormValues>({
    resolver: zodResolver(roomFormSchema),
    defaultValues: initialValues,
  })
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(values: RoomFormValues) {
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
      aria-label={isEdit ? 'Editar sala' : 'Nueva sala'}
      onSubmit={(event) => void handleSubmit(submit)(event)}
      className="flex flex-col gap-4"
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Nombre" error={errors.name?.message} required>
        {(c) => <Input autoComplete="off" maxLength={80} {...register('name')} {...c} />}
      </Field>
      <Controller
        control={control}
        name="specialties"
        render={({ field }) => (
          <CheckboxGroup
            legend="Especialidades que admite (vacío = cualquiera)"
            options={SPECIALTY_OPTIONS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {isEdit && <CheckboxField label="Sala activa" {...register('is_active')} />}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {isEdit ? 'Guardar cambios' : 'Crear sala'}
        </Button>
      </div>
    </form>
  )
}

/** Salas/camillas: una cita en sala no puede solaparse con otra en la misma sala. */
export function RoomsTab() {
  const rooms = useAllRooms()
  const create = useCreateRoom()
  const update = useUpdateRoom()
  const [editing, setEditing] = useState<RoomRead | 'new' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function save(values: RoomFormValues) {
    if (editing === 'new') {
      await create.mutateAsync(toRoomCreate(values))
      setMessage('Sala creada.')
    } else if (editing) {
      await update.mutateAsync({
        id: editing.id,
        changes: {
          name: values.name.trim(),
          specialties: values.specialties,
          is_active: values.is_active,
        },
      })
      setMessage('Sala actualizada.')
    }
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setMessage(null)
            setEditing('new')
          }}
        >
          Nueva sala
        </Button>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {message && <Alert tone="success">{message}</Alert>}
      </div>
      {rooms.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando salas…
        </p>
      )}
      {rooms.isError && <AgendaError error={rooms.error} />}
      {rooms.data &&
        (rooms.data.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
            Todavía no hay salas.
          </p>
        ) : (
          <Table caption="Salas">
            <thead>
              <tr>
                <Th>Sala</Th>
                <Th>Especialidades</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {rooms.data.map((room) => (
                <tr key={room.id}>
                  <Td className="font-medium">{room.name}</Td>
                  <Td>
                    {room.specialties.length === 0
                      ? 'Cualquiera'
                      : room.specialties.map((s) => SPECIALTY_LABELS[s]).join(', ')}
                  </Td>
                  <Td>
                    {room.is_active ? (
                      <Badge tone="success" icon="●">
                        Activa
                      </Badge>
                    ) : (
                      <Badge tone="neutral" icon="○">
                        Inactiva
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    <Button
                      variant="secondary"
                      className="min-h-8 px-2.5 py-1 text-xs"
                      aria-label={`Editar sala ${room.name}`}
                      onClick={() => {
                        setMessage(null)
                        setEditing(room)
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
        title={editing === 'new' ? 'Nueva sala' : 'Editar sala'}
      >
        {editing !== null && (
          <RoomForm
            isEdit={editing !== 'new'}
            initialValues={
              editing === 'new'
                ? EMPTY_ROOM_VALUES
                : {
                    name: editing.name,
                    specialties: editing.specialties,
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
