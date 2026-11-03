import { screen, within } from '@testing-library/react'

import { limaInstant, todayLimaKey } from '@/shared/lib/dates'
import { makeAppointment } from '@/test/appointments'
import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { MyAgendaPage } from './MyAgendaPage'

afterEach(() => vi.unstubAllGlobals())

describe('MyAgendaPage: ficha clínica desde la agenda', () => {
  it('ofrece «Iniciar atención» (ficha) solo a quien está en espera y «Continuar ficha» a quien ya está en atención', async () => {
    const today = todayLimaKey()
    const at = (time: string) => limaInstant(today, time).toISOString()
    const rows = [
      makeAppointment({
        id: 'w',
        patient_name: 'Rosa Quispe',
        status: 'CHECKED_IN',
        starts_at: at('09:00'),
        ends_at: at('09:30'),
        checked_in_at: at('08:55'),
      }),
      makeAppointment({
        id: 'i',
        patient_name: 'Luis Rojas',
        status: 'IN_PROGRESS',
        starts_at: at('10:00'),
        ends_at: at('10:30'),
      }),
      makeAppointment({
        id: 'c',
        patient_name: 'Ana Díaz',
        status: 'CONFIRMED',
        starts_at: at('11:00'),
        ends_at: at('11:30'),
      }),
    ]
    installFetch((c) =>
      c.url.startsWith('/api/appointments?') ? jsonResponse(200, rows) : undefined,
    )
    renderWithAuth(<MyAgendaPage />, makeUser(['DOCTOR'], { id: 'd-1' }))

    expect(
      await screen.findByRole('button', { name: 'Iniciar atención: Rosa Quispe' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar ficha: Luis Rojas' })).toBeInTheDocument()
    const confirmed = screen.getByText('Ana Díaz').closest('li') as HTMLElement
    expect(
      within(confirmed).queryByRole('button', { name: /ficha|Iniciar/ }),
    ).not.toBeInTheDocument()
  })
})
