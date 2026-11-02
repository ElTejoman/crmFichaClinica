import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { useDoctors } from '@/entities/doctor'
import { formatCalendarDate, todayLimaKey } from '@/shared/lib/dates'
import type { ExceptionCreated, ExceptionRead } from '@/shared/types/aliases'
import { Alert, Button, Dialog, Field, Input, Select, Spinner, Table, Td, Th } from '@/shared/ui'

import { useCreateException, useDeleteException, useExceptions } from '../api/useScheduleConfig'
import { AgendaError } from '../components/AgendaError'
import {
  EMPTY_EXCEPTION_VALUES,
  exceptionFormSchema,
  toExceptionCreate,
  type ExceptionFormValues,
} from '../schemas'
import { mapConfigError } from './formHelpers'

const LINK =
  'font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/** Aviso tras crear una excepción: las citas abiertas del rango NO se cancelan solas. */
export function AffectedAppointmentsNotice({ created }: { created: ExceptionCreated }) {
  const search = new URLSearchParams({ fecha: created.start_date })
  if (created.doctor_user_id) search.set('doctor', created.doctor_user_id)
  if (created.affected_appointments === 0) {
    return (
      <Alert tone="success">
        Excepción creada. No hay citas abiertas en ese rango; ya no se ofrecerán huecos esos días.
      </Alert>
    )
  }
  const n = created.affected_appointments
  return (
    <Alert tone="warning" title="Excepción creada: hay citas que reprogramar">
      <p>
        Hay {n} {n === 1 ? 'cita abierta' : 'citas abiertas'} dentro del rango{' '}
        {formatCalendarDate(created.start_date)} – {formatCalendarDate(created.end_date)}. No se
        cancelaron automáticamente: reprográmelas o cancélelas desde la agenda.
      </p>
      <p className="mt-1.5">
        <Link to={`/agenda?${search.toString()}`} className={LINK}>
          Ver la agenda de esas fechas
        </Link>
      </p>
    </Alert>
  )
}

function ExceptionForm({
  onCreated,
  onCancel,
}: {
  onCreated: (created: ExceptionCreated) => void
  onCancel: () => void
}) {
  const doctors = useDoctors()
  const create = useCreateException()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExceptionFormValues>({
    resolver: zodResolver(exceptionFormSchema),
    defaultValues: EMPTY_EXCEPTION_VALUES,
  })
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(values: ExceptionFormValues) {
    setFormError(null)
    try {
      onCreated(await create.mutateAsync(toExceptionCreate(values)))
    } catch (error) {
      setFormError(mapConfigError(error).message)
    }
  }

  return (
    <form
      noValidate
      aria-label="Nueva excepción"
      onSubmit={(event) => void handleSubmit(submit)(event)}
      className="flex flex-col gap-4"
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Aplica a" required>
        {(c) => (
          <Select {...register('doctor_user_id')} {...c}>
            <option value="">Toda la clínica (feriado)</option>
            {(doctors.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Desde" error={errors.start_date?.message} required>
          {(c) => <Input type="date" {...register('start_date')} {...c} />}
        </Field>
        <Field label="Hasta" error={errors.end_date?.message} required>
          {(c) => <Input type="date" {...register('end_date')} {...c} />}
        </Field>
      </div>
      <Field label="Motivo" error={errors.reason?.message} required>
        {(c) => <Input autoComplete="off" maxLength={200} {...register('reason')} {...c} />}
      </Field>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending}>
          Crear excepción
        </Button>
      </div>
    </form>
  )
}

/** Vacaciones y feriados: bloquean la disponibilidad pero no tocan las citas ya agendadas. */
export function ExceptionsTab() {
  const fromDate = todayLimaKey()
  const exceptions = useExceptions(fromDate)
  const remove = useDeleteException()
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<ExceptionCreated | null>(null)
  const [removed, setRemoved] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<ExceptionRead | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Se listan las excepciones que terminan hoy o después.
        </p>
        <Button
          onClick={() => {
            setCreated(null)
            setRemoved(null)
            setCreating(true)
          }}
        >
          Nueva excepción
        </Button>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {created && <AffectedAppointmentsNotice created={created} />}
        {removed && <Alert tone="success">{removed}</Alert>}
      </div>
      {exceptions.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando excepciones…
        </p>
      )}
      {exceptions.isError && <AgendaError error={exceptions.error} />}
      {exceptions.data &&
        (exceptions.data.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
            No hay excepciones vigentes ni futuras.
          </p>
        ) : (
          <Table caption="Excepciones de horario">
            <thead>
              <tr>
                <Th>Aplica a</Th>
                <Th>Desde</Th>
                <Th>Hasta</Th>
                <Th>Motivo</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {exceptions.data.map((exception) => (
                <tr key={exception.id}>
                  <Td>{exception.doctor_name ?? 'Toda la clínica'}</Td>
                  <Td className="whitespace-nowrap">{formatCalendarDate(exception.start_date)}</Td>
                  <Td className="whitespace-nowrap">{formatCalendarDate(exception.end_date)}</Td>
                  <Td>{exception.reason}</Td>
                  <Td>
                    <Button
                      variant="secondary"
                      className="min-h-8 px-2.5 py-1 text-xs"
                      aria-label={`Eliminar excepción: ${exception.reason}`}
                      onClick={() => {
                        remove.reset()
                        setConfirming(exception)
                      }}
                    >
                      Eliminar
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nueva excepción">
        {creating && (
          <ExceptionForm
            onCancel={() => setCreating(false)}
            onCreated={(result) => {
              setCreated(result)
              setCreating(false)
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Eliminar excepción"
        description="Los días volverán a ofrecer huecos según el horario semanal."
      >
        {confirming && (
          <div className="flex flex-col gap-4">
            {remove.isError && <AgendaError error={remove.error} />}
            <p className="text-sm text-slate-700">
              {confirming.doctor_name ?? 'Toda la clínica'} · {confirming.reason} ·{' '}
              {formatCalendarDate(confirming.start_date)} –{' '}
              {formatCalendarDate(confirming.end_date)}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Volver
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(confirming.id, {
                    onSuccess: () => {
                      setRemoved('Excepción eliminada.')
                      setCreated(null)
                      setConfirming(null)
                    },
                  })
                }
              >
                Eliminar
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
