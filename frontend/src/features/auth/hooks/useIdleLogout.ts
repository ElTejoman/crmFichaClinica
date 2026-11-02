import { useEffect, useRef } from 'react'

/** 15 min sin actividad (docs/04 §4). */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const

/**
 * Llama a `onIdle` tras `timeoutMs` sin actividad del usuario. Solo escucha si `enabled`
 * (sesión activa). Una pantalla clínica abierta y desatendida es un riesgo de confidencialidad.
 */
export function useIdleLogout(
  enabled: boolean,
  onIdle: () => void,
  timeoutMs: number = IDLE_TIMEOUT_MS,
): void {
  // Ref para no reiniciar los listeners cuando cambia la identidad de `onIdle`.
  const onIdleRef = useRef(onIdle)
  useEffect(() => {
    onIdleRef.current = onIdle
  }, [onIdle])

  useEffect(() => {
    if (!enabled) return
    let timer = window.setTimeout(() => onIdleRef.current(), timeoutMs)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => onIdleRef.current(), timeoutMs)
    }
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, reset, { passive: true })
    return () => {
      window.clearTimeout(timer)
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, reset)
    }
  }, [enabled, timeoutMs])
}
