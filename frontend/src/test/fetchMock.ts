/** Utilidades para simular el API en pruebas de componentes (sin red). */

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export interface RecordedCall {
  method: string
  url: string
  body: unknown
  /** Cuerpo multipart (subida de archivos), si lo hubo. */
  formData?: FormData
}

type Handler = (call: RecordedCall) => Response | undefined

/**
 * Instala un `fetch` simulado. Cada manejador recibe la llamada y devuelve una respuesta o
 * `undefined` para pasar al siguiente; lo no atendido responde 404 para que la prueba falle fuerte.
 */
export function installFetch(...handlers: Handler[]) {
  const calls: RecordedCall[] = []
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const call: RecordedCall = {
      method: init?.method ?? 'GET',
      url: String(input),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      ...(init?.body instanceof FormData ? { formData: init.body } : {}),
    }
    calls.push(call)
    for (const handler of handlers) {
      const response = handler(call)
      if (response) return Promise.resolve(response)
    }
    return Promise.resolve(
      jsonResponse(404, { error: { code: 'not_found', message: `Sin simular: ${call.url}` } }),
    )
  })
  vi.stubGlobal('fetch', fn)
  return calls
}
