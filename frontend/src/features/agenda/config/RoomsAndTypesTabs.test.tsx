import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { RoomsTab } from './RoomsTab'
import { TypesTab } from './TypesTab'

afterEach(() => vi.unstubAllGlobals())

describe('RoomsTab', () => {
  it('duplicate_name aparece junto al campo Nombre', async () => {
    installFetch(
      (c) =>
        c.method === 'POST'
          ? jsonResponse(409, {
              error: { code: 'duplicate_name', message: 'Ya existe una sala con ese nombre' },
            })
          : undefined,
      (c) => (c.url.startsWith('/api/rooms') ? jsonResponse(200, []) : undefined),
    )
    const user = userEvent.setup()
    renderWithAuth(<RoomsTab />, makeUser(['RECEPTION']))
    await user.click(await screen.findByRole('button', { name: 'Nueva sala' }))
    await user.type(screen.getByLabelText(/^Nombre/), 'E2E Sala 1')
    await user.click(screen.getByRole('button', { name: 'Crear sala' }))
    expect(await screen.findByText('Ya existe una sala con ese nombre')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nombre/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('exige el nombre', async () => {
    const calls = installFetch((c) =>
      c.url.startsWith('/api/rooms') ? jsonResponse(200, []) : undefined,
    )
    const user = userEvent.setup()
    renderWithAuth(<RoomsTab />, makeUser(['RECEPTION']))
    await user.click(await screen.findByRole('button', { name: 'Nueva sala' }))
    await user.click(screen.getByRole('button', { name: 'Crear sala' }))
    expect(await screen.findByText('Ingrese el nombre de la sala')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })
})

describe('TypesTab', () => {
  it('crea un tipo con duración numérica y especialidad', async () => {
    const calls = installFetch(
      (c) =>
        c.method === 'POST'
          ? jsonResponse(201, {
              id: 't-9',
              specialty: 'NUTRITION',
              name: 'E2E Control',
              duration_minutes: 45,
              is_active: true,
            })
          : undefined,
      (c) => (c.url.startsWith('/api/appointment-types') ? jsonResponse(200, []) : undefined),
    )
    const user = userEvent.setup()
    renderWithAuth(<TypesTab />, makeUser(['RECEPTION']))
    await user.click(await screen.findByRole('button', { name: 'Nuevo tipo de cita' }))
    await user.selectOptions(screen.getByLabelText(/^Especialidad/), 'NUTRITION')
    await user.type(screen.getByLabelText(/^Nombre/), 'E2E Control')
    const duration = screen.getByLabelText(/^Duración/)
    await user.clear(duration)
    await user.type(duration, '45')
    await user.click(screen.getByRole('button', { name: 'Crear tipo' }))
    expect(await screen.findByText('Tipo de cita creado.')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      specialty: 'NUTRITION',
      name: 'E2E Control',
      duration_minutes: 45,
    })
  })

  it('rechaza duraciones que no sean múltiplo de 5', async () => {
    installFetch((c) =>
      c.url.startsWith('/api/appointment-types') ? jsonResponse(200, []) : undefined,
    )
    const user = userEvent.setup()
    renderWithAuth(<TypesTab />, makeUser(['RECEPTION']))
    await user.click(await screen.findByRole('button', { name: 'Nuevo tipo de cita' }))
    await user.selectOptions(screen.getByLabelText(/^Especialidad/), 'NUTRITION')
    await user.type(screen.getByLabelText(/^Nombre/), 'X')
    const duration = screen.getByLabelText(/^Duración/)
    await user.clear(duration)
    await user.type(duration, '33')
    await user.click(screen.getByRole('button', { name: 'Crear tipo' }))
    expect(await screen.findByText(/múltiplos de 5/)).toBeInTheDocument()
  })
})
