import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { LeadCreatePanel } from './LeadCreatePanel'

afterEach(() => vi.unstubAllGlobals())

const created = { id: 'lead-9', full_name: 'Ana Soto', activities: [] }

describe('LeadCreatePanel', () => {
  it('ante un 409 de duplicado muestra el diálogo y "Crear de todos modos" reenvía con allow_duplicate', async () => {
    const calls = installFetch((c) => {
      if (c.method !== 'POST') return undefined
      if (c.url === '/api/leads') {
        return jsonResponse(409, {
          error: {
            code: 'conflict',
            message: 'Ya existe un lead o paciente con ese teléfono o correo',
            details: {
              code: 'possible_duplicate',
              leads: [{ id: 'l-1', full_name: 'Ana S.', status: 'CONTACTED' }],
              patients: [{ id: 'p-1', full_name: 'María Gómez Ríos' }],
            },
          },
        })
      }
      return c.url === '/api/leads?allow_duplicate=true' ? jsonResponse(201, created) : undefined
    })
    const onCreated = vi.fn()
    const user = userEvent.setup()
    renderWithAuth(
      <LeadCreatePanel assignees={[]} onCreated={onCreated} onCancel={() => undefined} />,
      makeUser(['RECEPTION']),
    )
    await user.type(screen.getByLabelText(/Nombre completo/), 'Ana Soto')
    await user.type(screen.getByLabelText(/Teléfono/), '987654321')
    await user.click(screen.getByRole('button', { name: 'Crear lead' }))

    const dialog = await screen.findByRole('dialog', { name: /Ya existe un registro/ })
    expect(within(dialog).getByRole('link', { name: 'Ana S.' })).toHaveAttribute(
      'href',
      '/leads/l-1',
    )
    expect(within(dialog).getByRole('link', { name: 'María Gómez Ríos' })).toHaveAttribute(
      'href',
      '/pacientes/p-1',
    )
    expect(onCreated).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Crear de todos modos' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(calls.map((c) => c.url)).toEqual(['/api/leads', '/api/leads?allow_duplicate=true'])
    expect(calls[1]?.body).toMatchObject({
      full_name: 'Ana Soto',
      phone: '987654321',
      source: 'WALK_IN',
    })
  })

  it('exige teléfono o correo antes de enviar', async () => {
    const calls = installFetch(() => undefined)
    const user = userEvent.setup()
    renderWithAuth(
      <LeadCreatePanel assignees={[]} onCreated={() => undefined} onCancel={() => undefined} />,
      makeUser(['RECEPTION']),
    )
    await user.type(screen.getByLabelText(/Nombre completo/), 'Ana Soto')
    await user.click(screen.getByRole('button', { name: 'Crear lead' }))
    expect(
      (await screen.findAllByText('Indique al menos un teléfono o un correo')).length,
    ).toBeGreaterThan(0)
    expect(calls).toHaveLength(0)
  })
})
