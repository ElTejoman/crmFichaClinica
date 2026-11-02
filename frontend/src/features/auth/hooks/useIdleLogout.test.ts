import { renderHook } from '@testing-library/react'

import { useIdleLogout } from './useIdleLogout'

describe('useIdleLogout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('llama a onIdle tras el tiempo sin actividad', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(true, onIdle, 1000))
    vi.advanceTimersByTime(999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('la actividad reinicia el contador', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(true, onIdle, 1000))
    vi.advanceTimersByTime(800)
    window.dispatchEvent(new Event('keydown'))
    vi.advanceTimersByTime(800)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('no hace nada si no hay sesión (enabled=false)', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(false, onIdle, 1000))
    vi.advanceTimersByTime(5000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
