import { describeStatus } from './describeStatus'

describe('describeStatus', () => {
  it('muestra "comprobando" mientras carga', () => {
    expect(describeStatus(true, false).tone).toBe('warn')
  })

  it('muestra error de conexión si la petición falla', () => {
    expect(describeStatus(false, true)).toEqual({
      label: 'Sin conexión con el servidor',
      tone: 'error',
    })
  })

  it('distingue servidor listo de base de datos caída', () => {
    expect(describeStatus(false, false, 'ready').tone).toBe('ok')
    expect(describeStatus(false, false, 'degraded').tone).toBe('error')
  })
})
