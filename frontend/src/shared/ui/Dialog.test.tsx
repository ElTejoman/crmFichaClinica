import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { Dialog } from './Dialog'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Confirmar">
        <button>Primero</button>
        <button>Último</button>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('es un diálogo modal con nombre accesible y enfoca su primer control', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirmar' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Primero' })).toHaveFocus()
  })

  it('atrapa el foco: Tab desde el último vuelve al primero y Shift+Tab al revés', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.tab()
    expect(screen.getByRole('button', { name: 'Último' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Primero' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Último' })).toHaveFocus()
  })

  it('Escape lo cierra y el foco vuelve al botón que lo abrió', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })
})
