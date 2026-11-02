import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { AppointmentStatus, Role } from '@/shared/types/aliases'
import { makeAppointment } from '@/test/appointments'
import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { AppointmentDetailDialog } from './AppointmentDetailDialog'

afterEach(() => vi.unstubAllGlobals())

const DOCTOR_ID = 'd-1'

function renderDialog(status: AppointmentStatus, roles: Role[], userId = 'u-1') {
  const user = makeUser(roles, { id: userId })
  return renderWithAuth(
    <AppointmentDetailDialog
      appointment={makeAppointment({ status, doctor_user_id: DOCTOR_ID })}
      viewer={{ id: user.id, roles: user.roles }}
      onClose={() => undefined}
    />,
    user,
  )
}

function buttonNames() {
  return screen
    .getAllByRole('button')
    .map((b) => b.textContent?.trim() ?? '')
    .filter((name) => name !== 'Cerrar')
}

describe('AppointmentDetailDialog: botones por estado y permiso', () => {
  it('recepción + Agendada: confirmar, llegada, reprogramar, ausencia y cancelar (nunca iniciar)', () => {
    renderDialog('SCHEDULED', ['RECEPTION'])
    expect(buttonNames()).toEqual([
      'Confirmar',
      'Registrar llegada',
      'Reprogramar',
      'Marcar ausencia',
      'Cancelar cita',
    ])
  })

  it('recepción + Confirmada: ya no ofrece Confirmar', () => {
    renderDialog('CONFIRMED', ['RECEPTION'])
    expect(buttonNames()).toEqual([
      'Registrar llegada',
      'Reprogramar',
      'Marcar ausencia',
      'Cancelar cita',
    ])
  })

  it('recepción + En espera: solo cancelar (no check-in otra vez)', () => {
    renderDialog('CHECKED_IN', ['RECEPTION'])
    expect(buttonNames()).toEqual(['Cancelar cita'])
  })

  it('el doctor de la cita ve Iniciar cuando el paciente ya llegó, y Completar en atención', () => {
    const { unmount } = renderDialog('CHECKED_IN', ['DOCTOR'], DOCTOR_ID)
    expect(buttonNames()).toEqual(['Iniciar atención'])
    unmount()
    renderDialog('IN_PROGRESS', ['DOCTOR'], DOCTOR_ID)
    expect(buttonNames()).toEqual(['Completar atención'])
  })

  it('otro doctor no ve acciones sobre una cita ajena', () => {
    renderDialog('CHECKED_IN', ['DOCTOR'], 'otro-doctor')
    expect(buttonNames()).toEqual([])
  })

  it('una cita atendida o cancelada no ofrece acciones', () => {
    const { unmount } = renderDialog('COMPLETED', ['RECEPTION'])
    expect(buttonNames()).toEqual([])
    unmount()
    renderDialog('CANCELLED', ['OWNER'])
    expect(buttonNames()).toEqual([])
  })

  it('muestra enlace a la ficha del paciente y el botón Ver serie solo si hay serie', () => {
    const { unmount } = renderDialog('SCHEDULED', ['RECEPTION'])
    expect(screen.getByRole('link', { name: 'Rosa Quispe' })).toHaveAttribute(
      'href',
      '/pacientes/p-1',
    )
    expect(screen.queryByRole('button', { name: 'Ver serie' })).not.toBeInTheDocument()
    unmount()
    const user = makeUser(['RECEPTION'])
    renderWithAuth(
      <AppointmentDetailDialog
        appointment={makeAppointment({ series_id: 's-1' })}
        viewer={{ id: user.id, roles: user.roles }}
        onClose={() => undefined}
      />,
      user,
    )
    expect(screen.getByRole('button', { name: 'Ver serie' })).toBeInTheDocument()
  })

  it('hora en Lima: 14:00Z se muestra como 09:00', () => {
    renderDialog('SCHEDULED', ['RECEPTION'])
    expect(screen.getByText(/09:00–09:30/)).toBeInTheDocument()
  })
})

describe('AppointmentDetailDialog: acciones', () => {
  it('check-in llama al endpoint y refleja el nuevo estado y el mensaje', async () => {
    const calls = installFetch((c) =>
      c.method === 'POST' && c.url === '/api/appointments/a-1/check-in'
        ? jsonResponse(
            200,
            makeAppointment({ status: 'CHECKED_IN', checked_in_at: '2026-11-03T13:55:00Z' }),
          )
        : undefined,
    )
    const user = userEvent.setup()
    renderDialog('CONFIRMED', ['RECEPTION'])
    await user.click(screen.getByRole('button', { name: 'Registrar llegada' }))
    expect(await screen.findByText(/Llegada registrada: el paciente/)).toBeInTheDocument()
    expect(calls.some((c) => c.url.endsWith('/check-in'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Registrar llegada' })).not.toBeInTheDocument()
    expect(screen.getByText('En espera (llegó)')).toBeInTheDocument()
  })

  it('check-in fuera de día: muestra el mensaje del servidor', async () => {
    installFetch(() =>
      jsonResponse(422, {
        error: {
          code: 'check_in_wrong_day',
          message: 'Solo se puede registrar la llegada el día de la cita',
        },
      }),
    )
    const user = userEvent.setup()
    renderDialog('CONFIRMED', ['RECEPTION'])
    await user.click(screen.getByRole('button', { name: 'Registrar llegada' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('el día de la cita')
  })

  it('cancelar exige motivo: sin motivo no hay petición; con motivo se envía {reason}', async () => {
    const calls = installFetch((c) =>
      c.method === 'POST' && c.url === '/api/appointments/a-1/cancel'
        ? jsonResponse(200, makeAppointment({ status: 'CANCELLED', cancel_reason: 'Viaja' }))
        : undefined,
    )
    const user = userEvent.setup()
    renderDialog('SCHEDULED', ['RECEPTION'])
    await user.click(screen.getByRole('button', { name: 'Cancelar cita' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))
    expect(await screen.findByText(/Indique el motivo/)).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)

    await user.type(screen.getByLabelText(/Motivo de la cancelación/), 'Viaja')
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ reason: 'Viaja' })
    expect(await screen.findByText(/Cita cancelada/)).toBeInTheDocument()
    expect(screen.getByText('Viaja')).toBeInTheDocument()
  })
})
