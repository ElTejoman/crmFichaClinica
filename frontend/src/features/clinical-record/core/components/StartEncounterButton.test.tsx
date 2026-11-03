import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'

import { makeEncounter } from '@/test/clinical'
import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { StartEncounterButton } from './StartEncounterButton'

afterEach(() => vi.unstubAllGlobals())

function renderButton() {
  return renderWithAuth(
    <Routes>
      <Route
        path="/"
        element={
          <StartEncounterButton
            appointmentId="a-1"
            patientId="p-1"
            patientName="Rosa Quispe"
            label="Iniciar atención"
          />
        }
      />
      <Route path="/pacientes/:patientId/encuentros/:encounterId" element={<p>Editor abierto</p>} />
    </Routes>,
    makeUser(['DOCTOR']),
  )
}

describe('StartEncounterButton', () => {
  it('crea el encuentro desde la cita y navega al editor', async () => {
    const calls = installFetch((c) =>
      c.method === 'POST' && c.url === '/api/encounters'
        ? jsonResponse(201, makeEncounter({ appointment_id: 'a-1' }))
        : undefined,
    )
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByRole('button', { name: 'Iniciar atención: Rosa Quispe' }))
    expect(await screen.findByText('Editor abierto')).toBeInTheDocument()
    expect(calls[0]?.body).toEqual({ appointment_id: 'a-1' })
  })

  it('encounter_exists (409) navega al encuentro existente en vez de mostrar un error', async () => {
    installFetch((c) =>
      c.method === 'POST'
        ? jsonResponse(409, {
            error: {
              code: 'encounter_exists',
              message: 'Esta cita ya tiene un encuentro',
              details: { encounter_id: 'e-77' },
            },
          })
        : undefined,
    )
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByRole('button', { name: /Iniciar atención/ }))
    expect(await screen.findByText('Editor abierto')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('otros errores (cita no lista, 403) se muestran junto al botón y no navegan', async () => {
    installFetch(() =>
      jsonResponse(422, {
        error: {
          code: 'appointment_not_ready',
          message: 'La cita no está lista: el paciente debe haber registrado su llegada',
        },
      }),
    )
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByRole('button', { name: /Iniciar atención/ }))
    expect(await screen.findByText(/La cita no está lista/)).toBeInTheDocument()
    expect(screen.queryByText('Editor abierto')).not.toBeInTheDocument()
  })
})
