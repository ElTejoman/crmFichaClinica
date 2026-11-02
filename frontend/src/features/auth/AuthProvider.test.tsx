import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { clearAccessToken } from '@/shared/lib/accessToken'

import { AuthProvider } from './AuthProvider'
import { LoginForm } from './components/LoginForm'
import { useAuth } from './useAuth'

const USER = {
  id: 'u1',
  email: 'dueno@clinica-demo.pe',
  full_name: 'Dueña Demo',
  phone: null,
  is_active: true,
  roles: ['OWNER'],
  doctor_profile: null,
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function Probe() {
  const { status, user } = useAuth()
  return <p>{status === 'authenticated' ? `hola ${user?.full_name}` : status}</p>
}

function renderApp(children: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearAccessToken()
})

describe('AuthProvider', () => {
  it('al arrancar restaura la sesión con refresh silencioso + /auth/me', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('/auth/refresh')
          ? json(200, { access_token: 't', token_type: 'bearer', expires_in: 900 })
          : json(200, USER),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderApp(<Probe />)
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(await screen.findByText('hola Dueña Demo')).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(['/api/auth/refresh', '/api/auth/me'])
  })

  it('sin cookie válida (401 en refresh) queda anónimo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { error: { code: 'not_authenticated', message: 'x' } })),
    )
    renderApp(<Probe />)
    expect(await screen.findByText('anonymous')).toBeInTheDocument()
  })
})

describe('LoginForm', () => {
  function stubAnonymousThen(loginResponse: Response) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('/auth/login')
            ? loginResponse
            : json(401, { error: { code: 'not_authenticated', message: 'x' } }),
        ),
      ),
    )
  }

  it('muestra los errores de validación en español sin llamar al servidor', async () => {
    stubAnonymousThen(json(200, {}))
    renderApp(<LoginForm />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Ingrese su correo')).toBeInTheDocument()
    expect(screen.getByText('Ingrese su contraseña')).toBeInTheDocument()
  })

  it('en 401 muestra el mensaje genérico del servidor', async () => {
    stubAnonymousThen(
      json(401, {
        error: { code: 'invalid_credentials', message: 'Correo o contraseña incorrectos' },
      }),
    )
    renderApp(<LoginForm />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/Correo/), 'alguien@clinica-demo.pe')
    await user.type(screen.getByLabelText(/Contraseña/), 'mala')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos'),
    )
  })
})
