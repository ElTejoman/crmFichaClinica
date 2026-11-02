import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { CareTeamPanel } from './CareTeamPanel'

const doctors = [
  { id: 'd-1', full_name: 'Dra. Nutrición', specialties: ['NUTRITION'] },
  { id: 'd-2', full_name: 'Dr. Quiropraxia', specialties: ['CHIROPRACTIC'] },
]

afterEach(() => vi.unstubAllGlobals())

describe('CareTeamPanel', () => {
  it('asigna al doctor elegido con POST {doctor_user_id}', async () => {
    const calls = installFetch(
      (c) => (c.url === '/api/doctors' ? jsonResponse(200, doctors) : undefined),
      (c) =>
        c.url === '/api/patients/p-1/care-team' && c.method === 'GET'
          ? jsonResponse(200, [])
          : undefined,
      (c) =>
        c.method === 'POST'
          ? jsonResponse(201, {
              id: 'ct-1',
              doctor_user_id: 'd-1',
              doctor_name: 'Dra. Nutrición',
              since: '2026-03-10T15:00:00Z',
              until: null,
              is_active: true,
            })
          : undefined,
    )
    const user = userEvent.setup()
    renderWithAuth(<CareTeamPanel patientId="p-1" />, makeUser(['RECEPTION']))
    const select = await screen.findByLabelText('Asignar doctor')
    await screen.findByRole('option', { name: /Dra\. Nutrición/ })
    await user.selectOptions(select, 'd-1')
    await user.click(screen.getByRole('button', { name: 'Asignar' }))

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ doctor_user_id: 'd-1' })
  })

  it('finalizar una asignación pide confirmación y llama a DELETE', async () => {
    const entry = {
      id: 'ct-1',
      doctor_user_id: 'd-1',
      doctor_name: 'Dra. Nutrición',
      since: '2026-03-10T15:00:00Z',
      until: null,
      is_active: true,
    }
    const calls = installFetch(
      (c) => (c.url === '/api/doctors' ? jsonResponse(200, doctors) : undefined),
      (c) =>
        c.url === '/api/patients/p-1/care-team' && c.method === 'GET'
          ? jsonResponse(200, [entry])
          : undefined,
      (c) => (c.method === 'DELETE' ? jsonResponse(204, undefined) : undefined),
    )
    const user = userEvent.setup()
    renderWithAuth(<CareTeamPanel patientId="p-1" />, makeUser(['OWNER']))
    await user.click(
      await screen.findByRole('button', { name: 'Finalizar asignación de Dra. Nutrición' }),
    )
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)

    const dialog = screen.getByRole('dialog', { name: 'Finalizar asignación' })
    await user.click(within(dialog).getByRole('button', { name: 'Finalizar asignación' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/api/patients/p-1/care-team/d-1')
  })
})
