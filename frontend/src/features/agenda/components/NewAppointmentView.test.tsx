import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeAppointment } from '@/test/appointments'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { NewAppointmentView } from './NewAppointmentView'

afterEach(() => vi.unstubAllGlobals())

const patient = {
  id: 'p-1',
  full_name: 'Rosa Quispe',
  hc_code: 'HC-000007',
}
const doctors = [{ id: 'd-1', full_name: 'Ana Torres', specialties: ['ACUPUNCTURE'] }]
const types = [
  { id: 't-1', specialty: 'ACUPUNCTURE', name: 'Control', duration_minutes: 30, is_active: true },
]
const availability = [
  {
    doctor_user_id: 'd-1',
    doctor_name: 'Ana Torres',
    slots: [
      { starts_at: '2026-11-10T14:00:00Z', ends_at: '2026-11-10T14:30:00Z' },
      { starts_at: '2026-11-10T14:30:00Z', ends_at: '2026-11-10T15:00:00Z' },
      { starts_at: '2026-11-11T14:00:00Z', ends_at: '2026-11-11T14:30:00Z' },
    ],
  },
]

function baseHandlers() {
  return [
    (c: { url: string; method: string }) =>
      c.url === '/api/patients/p-1' ? jsonResponse(200, patient) : undefined,
    (c: { url: string }) => (c.url === '/api/doctors' ? jsonResponse(200, doctors) : undefined),
    (c: { url: string }) => (c.url === '/api/rooms' ? jsonResponse(200, []) : undefined),
    (c: { url: string }) =>
      c.url.startsWith('/api/appointment-types') ? jsonResponse(200, types) : undefined,
    (c: { url: string }) =>
      c.url.startsWith('/api/appointments/availability')
        ? jsonResponse(200, availability)
        : undefined,
  ]
}

function renderView(route = '/agenda/nueva?patient=p-1') {
  return renderWithAuth(
    <Routes>
      <Route path="/agenda/nueva" element={<NewAppointmentView />} />
      <Route path="/agenda" element={<p>Pantalla del calendario</p>} />
    </Routes>,
    makeUser(['RECEPTION']),
    route,
  )
}

async function fillUntilSlots(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText(/^Especialidad/), 'ACUPUNCTURE')
  const typeSelect = screen.getByLabelText(/^Tipo de cita/)
  await waitFor(() => expect(within(typeSelect).getByText(/Control · 30 min/)).toBeInTheDocument())
  await user.selectOptions(typeSelect, 't-1')
}

describe('NewAppointmentView', () => {
  it('?patient=<id> viene pre-seleccionado desde la ficha', async () => {
    installFetch(...baseHandlers())
    renderView()
    expect(await screen.findByText('Rosa Quispe')).toBeInTheDocument()
    expect(screen.getByText(/HC-000007/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar paciente' })).toBeInTheDocument()
  })

  it('flujo: huecos agrupados por día → elegir → agendar con ISO con zona y volver al calendario', async () => {
    const calls = installFetch(
      (c) =>
        c.method === 'POST' && c.url === '/api/appointments'
          ? jsonResponse(201, makeAppointment({ starts_at: '2026-11-10T14:00:00Z' }))
          : undefined,
      ...baseHandlers(),
    )
    const user = userEvent.setup()
    renderView()
    await screen.findByText('Rosa Quispe')
    await fillUntilSlots(user)

    // Un grupo por día de Lima (10 y 11 de noviembre), con la hora local 09:00 (no 14:00).
    const day10 = await screen.findByRole('region', { name: /martes 10 de noviembre/ })
    const day11 = screen.getByRole('region', { name: /miércoles 11 de noviembre/ })
    expect(within(day10).getAllByRole('button')).toHaveLength(2)
    expect(within(day11).getAllByRole('button')).toHaveLength(1)
    expect(within(day10).queryByText('14:00')).not.toBeInTheDocument()

    await user.click(within(day10).getByRole('button', { name: /^09:00/ }))
    expect(screen.getByText(/Hueco elegido/)).toHaveTextContent('09:00')
    await user.click(screen.getByRole('button', { name: 'Agendar cita' }))

    await waitFor(() => expect(screen.getByText('Pantalla del calendario')).toBeInTheDocument())
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.body).toMatchObject({
      patient_id: 'p-1',
      doctor_user_id: 'd-1',
      specialty: 'ACUPUNCTURE',
      starts_at: '2026-11-10T14:00:00.000Z',
      appointment_type_id: 't-1',
    })
  })

  it('el botón Agendar sigue deshabilitado hasta elegir un hueco', async () => {
    installFetch(...baseHandlers())
    const user = userEvent.setup()
    renderView()
    await screen.findByText('Rosa Quispe')
    expect(screen.getByRole('button', { name: 'Agendar cita' })).toBeDisabled()
    await fillUntilSlots(user)
    await screen.findByRole('region', { name: /martes 10 de noviembre/ })
    expect(screen.getByRole('button', { name: 'Agendar cita' })).toBeDisabled()
  })

  it('409 appointment_overlap: muestra qué se pisa y cuándo, sin salir de la pantalla', async () => {
    installFetch(
      (c) =>
        c.method === 'POST' && c.url === '/api/appointments'
          ? jsonResponse(409, {
              error: {
                code: 'appointment_overlap',
                message: 'Conflicto',
                details: {
                  resource: 'doctor',
                  conflicts: [
                    {
                      resource: 'doctor',
                      starts_at: '2026-11-10T14:00:00Z',
                      ends_at: '2026-11-10T14:30:00Z',
                    },
                  ],
                },
              },
            })
          : undefined,
      ...baseHandlers(),
    )
    const user = userEvent.setup()
    renderView()
    await screen.findByText('Rosa Quispe')
    await fillUntilSlots(user)
    const day10 = await screen.findByRole('region', { name: /martes 10 de noviembre/ })
    await user.click(within(day10).getByRole('button', { name: /^09:00/ }))
    await user.click(screen.getByRole('button', { name: 'Agendar cita' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('El doctor ya tiene una cita que se cruza con ese horario.')
    expect(alert).toHaveTextContent('mar 10/11 · 09:00–09:30')
    expect(screen.queryByText('Pantalla del calendario')).not.toBeInTheDocument()
  })

  it('paquete: vista previa de 4 fechas semanales a la misma hora local y envío a /series', async () => {
    const calls = installFetch(
      (c) =>
        c.method === 'POST' && c.url === '/api/appointments/series'
          ? jsonResponse(201, {
              series_id: 's-1',
              appointments: [makeAppointment({ starts_at: '2026-11-10T14:00:00Z' })],
            })
          : undefined,
      ...baseHandlers(),
    )
    const user = userEvent.setup()
    renderView()
    await screen.findByText('Rosa Quispe')
    await fillUntilSlots(user)
    const day10 = await screen.findByRole('region', { name: /martes 10 de noviembre/ })
    await user.click(within(day10).getByRole('button', { name: /^09:00/ }))
    await user.click(screen.getByLabelText(/Agendar un paquete de sesiones/))

    const preview = screen.getByRole('list', { name: 'Sesiones del paquete' })
    const dates = within(preview).getAllByRole('listitem')
    expect(dates).toHaveLength(4)
    expect(dates[0]).toHaveTextContent('martes 10 de noviembre de 2026')
    expect(dates[3]).toHaveTextContent('martes 1 de diciembre de 2026')
    expect(screen.getByText(/todas a las 09:00/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Agendar paquete \(4 sesiones\)/ }))
    await waitFor(() => expect(screen.getByText('Pantalla del calendario')).toBeInTheDocument())
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.url).toBe('/api/appointments/series')
    expect(post?.body).toMatchObject({
      count: 4,
      interval_days: 7,
      starts_at: '2026-11-10T14:00:00.000Z',
    })
  })

  it('series_invalid: lista todas las sesiones problemáticas', async () => {
    installFetch(
      (c) =>
        c.method === 'POST' && c.url === '/api/appointments/series'
          ? jsonResponse(422, {
              error: {
                code: 'series_invalid',
                message: 'Serie inválida',
                details: {
                  sessions: [
                    {
                      session: 2,
                      starts_at: '2026-11-17T14:00:00Z',
                      code: 'doctor_unavailable',
                      message: 'El doctor no atiende: Feriado',
                    },
                    {
                      session: 3,
                      starts_at: '2026-11-24T14:00:00Z',
                      code: 'appointment_overlap',
                      message: 'Choca con otra cita',
                    },
                  ],
                },
              },
            })
          : undefined,
      ...baseHandlers(),
    )
    const user = userEvent.setup()
    renderView()
    await screen.findByText('Rosa Quispe')
    await fillUntilSlots(user)
    const day10 = await screen.findByRole('region', { name: /martes 10 de noviembre/ })
    await user.click(within(day10).getByRole('button', { name: /^09:00/ }))
    await user.click(screen.getByLabelText(/Agendar un paquete de sesiones/))
    await user.click(screen.getByRole('button', { name: /Agendar paquete/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('2 sesiones tienen problemas')
    expect(within(alert).getAllByRole('listitem')).toHaveLength(2)
    expect(alert).toHaveTextContent('Sesión 2 (mar 17/11 09:00): El doctor no atiende: Feriado')
    expect(alert).toHaveTextContent('Sesión 3 (mar 24/11 09:00): Choca con otra cita')
  })
})
