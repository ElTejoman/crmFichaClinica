import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { PatientsList } from './PatientsList'

const maria = {
  id: 'p-1',
  full_name: 'María Gómez Ríos',
  document_type: 'DNI',
  document_number: '45123789',
  birth_date: '1985-02-03',
  phone: '+51987654321',
  hc_number: 1,
  is_active: true,
  hc_code: 'HC-000001',
  age: 41,
}

afterEach(() => vi.unstubAllGlobals())

describe('PatientsList', () => {
  it('busca con debounce enviando q tal cual (el servidor ignora tildes) y muestra resultados', async () => {
    const calls = installFetch((c) =>
      c.url.startsWith('/api/patients?') ? jsonResponse(200, [maria]) : undefined,
    )
    const user = userEvent.setup()
    renderWithAuth(<PatientsList canManage />, makeUser(['RECEPTION']))
    await screen.findByRole('link', { name: 'María Gómez Ríos' })

    await user.type(screen.getByLabelText(/Buscar paciente/), 'maria gomez')
    await waitFor(() => expect(calls.some((c) => c.url.includes('q=maria+gomez'))).toBe(true))
    // Una sola consulta con el texto completo: no una por tecla.
    expect(calls.filter((c) => c.url.includes('q=')).length).toBe(1)
  })

  it('"Nuevo paciente" solo aparece con permiso de gestión', async () => {
    installFetch(() => jsonResponse(200, []))
    const { unmount } = renderWithAuth(<PatientsList canManage />, makeUser(['RECEPTION']))
    expect(await screen.findByRole('link', { name: 'Nuevo paciente' })).toHaveAttribute(
      'href',
      '/pacientes/nuevo',
    )
    unmount()
    renderWithAuth(<PatientsList canManage={false} />, makeUser(['DOCTOR']))
    await screen.findByText('No hay pacientes para mostrar.')
    expect(screen.queryByRole('link', { name: 'Nuevo paciente' })).not.toBeInTheDocument()
  })

  it('"Incluir archivados" agrega include_inactive a la consulta', async () => {
    const calls = installFetch(() => jsonResponse(200, []))
    const user = userEvent.setup()
    renderWithAuth(<PatientsList canManage />, makeUser(['OWNER']))
    await screen.findByText('No hay pacientes para mostrar.')
    await user.click(screen.getByRole('checkbox', { name: 'Incluir archivados' }))
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes('include_inactive=true'))).toBe(true),
    )
  })

  it('pide una fila de más para saber si hay página siguiente', async () => {
    const calls = installFetch(() => jsonResponse(200, []))
    renderWithAuth(<PatientsList canManage />, makeUser(['OWNER']))
    await screen.findByText('No hay pacientes para mostrar.')
    expect(calls[0]?.url).toContain('limit=21')
  })
})
