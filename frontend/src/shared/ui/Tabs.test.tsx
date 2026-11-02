import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { Tabs } from './Tabs'

const TABS = [
  { id: 'a', label: 'Uno' },
  { id: 'b', label: 'Dos' },
  { id: 'c', label: 'Tres' },
] as const

function Harness() {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a')
  return (
    <Tabs label="Vistas" tabs={TABS} value={value} onChange={setValue}>
      Contenido {value}
    </Tabs>
  )
}

describe('Tabs', () => {
  it('solo la pestaña activa está en el orden de tabulación y el panel está asociado', () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: 'Uno' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('tabpanel', { name: 'Uno' })).toHaveTextContent('Contenido a')
  })

  it('las flechas cambian de pestaña (con vuelta al inicio) y Fin/Inicio saltan', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('tab', { name: 'Uno' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Tres' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Uno' })).toHaveAttribute('aria-selected', 'true')
  })
})
