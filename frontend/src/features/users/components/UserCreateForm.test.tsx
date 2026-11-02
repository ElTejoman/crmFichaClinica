import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { UserCreateForm } from './UserCreateForm'

function setup(actorRoles: ('OWNER' | 'SUPERUSER')[] = ['OWNER']) {
  const onCreated = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <UserCreateForm actorRoles={actorRoles} onCreated={onCreated} onCancel={() => undefined} />
    </QueryClientProvider>,
  )
  return { onCreated, user: userEvent.setup() }
}

afterEach(() => vi.unstubAllGlobals())

describe('UserCreateForm', () => {
  it('muestra el bloque de doctor solo cuando se marca el rol Doctor/a', async () => {
    const { user } = setup()
    expect(screen.queryByText('Perfil de doctor')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Doctor/a' }))
    expect(screen.getByText('Perfil de doctor')).toBeInTheDocument()
    expect(screen.getByLabelText(/N\.º de colegiatura/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Acupuntura' })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Doctor/a' }))
    expect(screen.queryByText('Perfil de doctor')).not.toBeInTheDocument()
  })

  it('un OWNER ve deshabilitados los roles Superusuario y Dueño', () => {
    setup(['OWNER'])
    expect(screen.getByRole('checkbox', { name: /Superusuario/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Dueño/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Recepción' })).toBeEnabled()
  })

  it('un SUPERUSER puede asignar Dueño', () => {
    setup(['SUPERUSER'])
    expect(screen.getByRole('checkbox', { name: /Dueño/ })).toBeEnabled()
  })

  it('valida en español: campos vacíos, rol, contraseña débil', async () => {
    const { user, onCreated } = setup()
    await user.type(screen.getByLabelText(/Contraseña inicial/), 'corta')
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Ingrese el correo')).toBeInTheDocument()
    expect(screen.getByText('Seleccione al menos un rol')).toBeInTheDocument()
    expect(screen.getByText(/Debe tener al menos 12 caracteres/)).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('con rol Doctor exige colegiatura, colegio y especialidad', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Doctor/a' }))
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Ingrese el N.º de colegiatura')).toBeInTheDocument()
    expect(screen.getByText('Seleccione el colegio profesional')).toBeInTheDocument()
    expect(screen.getByText('Seleccione al menos una especialidad')).toBeInTheDocument()
  })

  it('envía doctor_profile solo para doctores y muestra el 409 junto al correo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'conflict', message: 'Ya existe un usuario con ese correo' },
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { user } = setup()

    await user.type(screen.getByLabelText(/Nombre completo/), 'Dra. Prueba')
    await user.type(screen.getByLabelText(/Correo electrónico/), 'dra@clinica-demo.pe')
    await user.type(screen.getByLabelText(/Contraseña inicial/), 'Clave-Segura-2026')
    await user.click(screen.getByRole('checkbox', { name: 'Doctor/a' }))
    await user.type(screen.getByLabelText(/N\.º de colegiatura/), '12345')
    await user.selectOptions(screen.getByLabelText(/Colegio profesional/), 'CMP')
    await user.click(screen.getByRole('checkbox', { name: 'Nutrición' }))
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: 'dra@clinica-demo.pe',
      roles: ['DOCTOR'],
      phone: null,
      doctor_profile: {
        license_number: '12345',
        professional_body: 'CMP',
        rne: null,
        specialties: ['NUTRITION'],
      },
    })
    expect(await screen.findByText('Ya existe un usuario con ese correo')).toBeInTheDocument()
  })
})
