import { act, renderHook } from '@testing-library/react'

import { AUTOSAVE_DELAY_MS, combineStatuses, useAutosave } from './useAutosave'

interface Payload extends Record<string, unknown> {
  subjective: string
  plan: string
}

const BASELINE: Payload = { subjective: '', plan: '' }

interface HookProps {
  payload: Payload
  valid?: boolean
}

function setup(save: (changes: Partial<Payload>) => Promise<unknown>, initial: Payload = BASELINE) {
  const initialProps: HookProps = { payload: initial }
  return renderHook(
    (props: HookProps) =>
      useAutosave<Payload>({
        payload: props.payload,
        baseline: BASELINE,
        valid: props.valid ?? true,
        enabled: true,
        save,
      }),
    { initialProps },
  )
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useAutosave', () => {
  it('no guarda a cada tecla: espera el debounce y envía UNA sola petición', async () => {
    const save = vi.fn(() => Promise.resolve())
    const { result, rerender } = setup(save)

    rerender({ payload: { subjective: 'D', plan: '' } })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100))
    rerender({ payload: { subjective: 'Do', plan: '' } })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100))
    expect(save).not.toHaveBeenCalled()
    expect(result.current.status).toBe('dirty')

    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ subjective: 'Do' })
    expect(result.current.status).toBe('saved')
  })

  it('envía solo las claves que cambiaron (PATCH parcial)', async () => {
    const save = vi.fn(() => Promise.resolve())
    const { rerender } = setup(save)
    rerender({ payload: { subjective: '', plan: 'Reposo' } })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    expect(save).toHaveBeenCalledWith({ plan: 'Reposo' })

    rerender({ payload: { subjective: 'Dolor', plan: 'Reposo' } })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    expect(save).toHaveBeenLastCalledWith({ subjective: 'Dolor' })
  })

  it('un error deja el estado en "error" y no reintenta solo; el siguiente cambio vuelve a intentarlo', async () => {
    const save = vi
      .fn<(changes: Partial<Payload>) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('fallo de red'))
      .mockResolvedValue(undefined)
    const { result, rerender } = setup(save)

    rerender({ payload: { subjective: 'A', plan: '' } })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBeInstanceOf(Error)

    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3))
    expect(save).toHaveBeenCalledTimes(1) // sin bucle de reintentos

    rerender({ payload: { subjective: 'AB', plan: '' } })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('saved')
  })

  it('si se escribe mientras se guarda, no hay guardados simultáneos: el mismo ciclo recoge lo nuevo', async () => {
    let release: () => void = () => undefined
    let running = 0
    let maxRunning = 0
    const save = vi.fn(() => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      return new Promise<void>((resolve) => {
        release = () => {
          running -= 1
          resolve()
        }
      })
    })
    const { result, rerender } = setup(save)

    rerender({ payload: { subjective: 'A', plan: '' } })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    expect(result.current.status).toBe('saving')

    rerender({ payload: { subjective: 'AB', plan: '' } })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)) // el timer cae con el primero en vuelo
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => release()) // termina el primero => el ciclo envía lo nuevo
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ subjective: 'AB' })
    await act(async () => release())
    expect(maxRunning).toBe(1)
    expect(result.current.status).toBe('saved')
  })

  it('con valores inválidos NO guarda, pero lo declara pendiente ("dirty")', async () => {
    const save = vi.fn(() => Promise.resolve())
    const { result, rerender } = setup(save)
    rerender({ payload: { subjective: 'x', plan: '' }, valid: false })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2))
    expect(save).not.toHaveBeenCalled()
    expect(result.current.status).toBe('dirty')
  })

  it('flush guarda al instante lo pendiente y devuelve true', async () => {
    const save = vi.fn(() => Promise.resolve())
    const { result, rerender } = setup(save)
    rerender({ payload: { subjective: 'Urgente', plan: '' } })

    let ok = false
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(true)
    expect(save).toHaveBeenCalledWith({ subjective: 'Urgente' })
  })

  it('flush devuelve false si no se pudo guardar', async () => {
    const save = vi.fn(() => Promise.reject(new Error('x')))
    const { result, rerender } = setup(save)
    rerender({ payload: { subjective: 'Urgente', plan: '' } })
    let ok = true
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(false)
  })

  it('al desmontar envía lo pendiente para no perder lo escrito', async () => {
    const save = vi.fn(() => Promise.resolve())
    const { rerender, unmount } = setup(save)
    rerender({ payload: { subjective: 'Casi se pierde', plan: '' } })
    unmount()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledWith({ subjective: 'Casi se pierde' })
  })
})

describe('combineStatuses', () => {
  it('prioriza error > guardando > pendiente > guardado', () => {
    expect(combineStatuses(['saved', 'dirty', 'error'])).toBe('error')
    expect(combineStatuses(['saved', 'saving', 'dirty'])).toBe('saving')
    expect(combineStatuses(['saved', 'dirty'])).toBe('dirty')
    expect(combineStatuses(['idle', 'saved'])).toBe('saved')
    expect(combineStatuses(['idle', 'idle'])).toBe('idle')
  })
})
