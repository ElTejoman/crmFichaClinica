import { clearAccessToken, getAccessToken, setAccessToken } from './accessToken'
import { ApiError, apiGet, apiPost, refreshAccessToken, setSessionExpiredHandler } from './http'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const tokenBody = (token: string) => ({
  access_token: token,
  token_type: 'bearer',
  expires_in: 900,
})

/** fetch simulado: responde por ruta; las rutas con función pueden variar según el Bearer. */
function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

const bearer = (init: RequestInit) => (init.headers as Record<string, string>).Authorization

afterEach(() => {
  vi.unstubAllGlobals()
  clearAccessToken()
  setSessionExpiredHandler(null)
})

describe('cliente HTTP', () => {
  it('adjunta el Bearer del token en memoria y usa el prefijo /api', async () => {
    setAccessToken('tok-1')
    const fetchMock = mockFetch(() => json(200, { ok: true }))
    await apiGet('/auth/me')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/auth/me')
    expect(bearer(init as RequestInit)).toBe('Bearer tok-1')
  })

  it('nunca guarda el token en localStorage/sessionStorage', async () => {
    mockFetch(() => json(200, tokenBody('secreto')))
    await refreshAccessToken()
    expect(getAccessToken()).toBe('secreto')
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('secreto')
  })

  it('ante 401 hace UN solo refresh compartido y reintenta cada petición una vez', async () => {
    setAccessToken('viejo')
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/refresh') return json(200, tokenBody('nuevo'))
      return bearer(init) === 'Bearer nuevo'
        ? json(200, { path: url })
        : json(401, { error: { code: 'not_authenticated', message: 'No autenticado' } })
    })

    const results = await Promise.all([apiGet('/users'), apiGet('/audit-logs'), apiGet('/auth/me')])

    expect(results).toEqual([
      { path: '/api/users' },
      { path: '/api/audit-logs' },
      { path: '/api/auth/me' },
    ])
    const refreshes = fetchMock.mock.calls.filter(([u]) => u === '/api/auth/refresh')
    expect(refreshes).toHaveLength(1)
    // 3 intentos originales + 1 refresh + 3 reintentos
    expect(fetchMock).toHaveBeenCalledTimes(7)
    expect(getAccessToken()).toBe('nuevo')
  })

  it('si el refresh falla avisa de sesión expirada, limpia el token y propaga el 401', async () => {
    setAccessToken('viejo')
    const onExpired = vi.fn()
    setSessionExpiredHandler(onExpired)
    mockFetch((url) =>
      url === '/api/auth/refresh'
        ? json(401, { error: { code: 'not_authenticated', message: 'Sin sesión' } })
        : json(401, { error: { code: 'not_authenticated', message: 'No autenticado' } }),
    )

    await expect(apiGet('/users')).rejects.toMatchObject({ status: 401 })
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
  })

  it('no entra en bucle: si el reintento también da 401, falla sin un segundo refresh', async () => {
    setAccessToken('viejo')
    const fetchMock = mockFetch((url) =>
      url === '/api/auth/refresh'
        ? json(200, tokenBody('nuevo'))
        : json(401, { error: { code: 'not_authenticated', message: 'No autenticado' } }),
    )
    await expect(apiGet('/users')).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/auth/refresh')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('skipAuth (login): un 401 es la respuesta, sin refresh ni Bearer', async () => {
    setAccessToken('viejo')
    const fetchMock = mockFetch(() =>
      json(401, { error: { code: 'invalid_credentials', message: 'Credenciales inválidas' } }),
    )
    await expect(
      apiPost('/auth/login', { email: 'a@b.pe', password: 'x' }, { skipAuth: true }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
      message: 'Credenciales inválidas',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bearer(fetchMock.mock.calls[0]?.[1] as RequestInit)).toBeUndefined()
  })

  it('envía JSON en POST y devuelve undefined en 204', async () => {
    const fetchMock = mockFetch(() => new Response(null, { status: 204 }))
    await expect(apiPost('/auth/logout', { a: 1 }, { skipAuth: true })).resolves.toBeUndefined()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
  })

  it('normaliza el 422 estándar de FastAPI a un mensaje legible en español', async () => {
    mockFetch(() =>
      json(422, {
        detail: [
          { loc: ['body', 'email'], msg: 'value is not a valid email address' },
          { loc: ['body', 'full_name'], msg: 'Value error, demasiado corto' },
        ],
      }),
    )
    await expect(apiPost('/users', {})).rejects.toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'Correo: value is not a valid email address. Nombre completo: demasiado corto',
    })
  })

  it('conserva code y message del error propio del API (403, 409, weak_password)', async () => {
    mockFetch(() => json(422, { error: { code: 'weak_password', message: 'Es demasiado común' } }))
    await expect(apiPost('/users', {})).rejects.toMatchObject({
      code: 'weak_password',
      message: 'Es demasiado común',
    })
  })

  it('convierte un fallo de red en ApiError legible', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed')
    })
    await expect(apiGet('/users')).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })

  it('acceptStatuses devuelve el cuerpo de un 503 como éxito', async () => {
    mockFetch(() => json(503, { status: 'degraded' }))
    await expect(apiGet('/ready', { acceptStatuses: [503] })).resolves.toEqual({
      status: 'degraded',
    })
  })
})
