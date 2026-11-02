import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LostReasonDialog } from './LostReasonDialog'

describe('LostReasonDialog', () => {
  it('exige el motivo: vacío no confirma y muestra el error', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <LostReasonDialog leadName="Ana Soto" onConfirm={onConfirm} onCancel={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: 'Marcar como perdido' }))
    expect(await screen.findByText(/Indique el motivo/)).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('un motivo en blanco tampoco vale', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <LostReasonDialog leadName="Ana Soto" onConfirm={onConfirm} onCancel={() => undefined} />,
    )
    await user.type(screen.getByLabelText(/Motivo de pérdida/), '   ')
    await user.click(screen.getByRole('button', { name: 'Marcar como perdido' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirma con el motivo escrito (recortado) o elegido de la lista', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <LostReasonDialog leadName="Ana Soto" onConfirm={onConfirm} onCancel={() => undefined} />,
    )
    await user.type(screen.getByLabelText(/Motivo de pérdida/), '  Se fue a otra clínica ')
    await user.click(screen.getByRole('button', { name: 'Marcar como perdido' }))
    expect(onConfirm).toHaveBeenCalledWith('Se fue a otra clínica')

    await user.click(screen.getByRole('button', { name: 'Precio' }))
    await user.click(screen.getByRole('button', { name: 'Marcar como perdido' }))
    expect(onConfirm).toHaveBeenLastCalledWith('Precio')
  })

  it('Escape lo cierra', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<LostReasonDialog leadName="Ana Soto" onConfirm={() => undefined} onCancel={onCancel} />)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('cerrado (sin lead) no renderiza nada', () => {
    render(
      <LostReasonDialog leadName={null} onConfirm={() => undefined} onCancel={() => undefined} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
