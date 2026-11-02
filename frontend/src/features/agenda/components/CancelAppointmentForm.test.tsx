import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CancelAppointmentForm } from './CancelAppointmentForm'

function setup() {
  const onConfirm = vi.fn()
  render(
    <CancelAppointmentForm
      onConfirm={onConfirm}
      onBack={() => undefined}
      loading={false}
      summary="la cita de Rosa Quispe"
    />,
  )
  return { onConfirm, user: userEvent.setup() }
}

describe('CancelAppointmentForm', () => {
  it('exige el motivo: vacío no confirma y muestra el error', async () => {
    const { onConfirm, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))
    expect(await screen.findByText(/Indique el motivo/)).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('un motivo en blanco tampoco vale', async () => {
    const { onConfirm, user } = setup()
    await user.type(screen.getByLabelText(/Motivo de la cancelación/), '    ')
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirma con el motivo recortado o elegido de la lista', async () => {
    const { onConfirm, user } = setup()
    await user.type(screen.getByLabelText(/Motivo de la cancelación/), '  Viaja ')
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))
    expect(onConfirm).toHaveBeenCalledWith('Viaja')

    await user.click(screen.getByRole('button', { name: 'Doctor no disponible' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))
    expect(onConfirm).toHaveBeenLastCalledWith('Doctor no disponible')
  })
})
