import { useCallback, useEffect, useRef, useState } from 'react'

import { diffPayload } from '../encounterForm'

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/** Espera tras la última tecla antes de guardar: evita una petición por pulsación. */
export const AUTOSAVE_DELAY_MS = 1200

interface UseAutosaveOptions<T extends Record<string, unknown>> {
  /** Estado actual ya normalizado (lo que se enviaría). */
  payload: T
  /** Lo último que el servidor confirmó (estado inicial al abrir el encuentro). */
  baseline: T
  /** Si es false (p. ej. un número mal escrito) no se guarda; el motivo lo muestra quien llama. */
  valid: boolean
  /** Falso cuando el encuentro es de solo lectura. */
  enabled: boolean
  delayMs?: number
  /** Recibe SOLO las claves que cambiaron. */
  save: (changes: Partial<T>) => Promise<unknown>
}

export interface AutosaveHandle {
  status: AutosaveStatus
  error: unknown
  /** Guarda ya lo pendiente. true = no queda nada sin guardar ni hubo error. */
  flush: () => Promise<boolean>
}

interface FailedSave {
  /** Estado del formulario en el que falló: el aviso desaparece en cuanto el doctor cambia algo. */
  payloadKey: string
  error: unknown
}

/**
 * Autoguardado con debounce para un grupo de campos. Garantías:
 *  - nunca hay dos guardados simultáneos del mismo grupo: si se escribe mientras se guarda, el
 *    mismo ciclo recoge lo nuevo al terminar (así no se pisa un guardado con otro más viejo);
 *  - tras un error no se reintenta en bucle: se espera el siguiente cambio del doctor;
 *  - al desmontar (salir de la pantalla) lo pendiente se envía, para no perder lo escrito.
 * El estado «pendiente» y el de error se DERIVAN en cada render (no se sincronizan con efectos).
 */
export function useAutosave<T extends Record<string, unknown>>({
  payload,
  baseline,
  valid,
  enabled,
  delayMs = AUTOSAVE_DELAY_MS,
  save,
}: UseAutosaveOptions<T>): AutosaveHandle {
  const [saved, setSaved] = useState<T>(baseline)
  const [saving, setSaving] = useState(false)
  const [wrote, setWrote] = useState(false)
  const [failure, setFailure] = useState<FailedSave | null>(null)

  const savedRef = useRef<T>(baseline)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef({ payload, valid, enabled, save })
  useEffect(() => {
    latestRef.current = { payload, valid, enabled, save }
  })

  const cycle = useCallback((): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current
    const task = (async (): Promise<boolean> => {
      for (;;) {
        const latest = latestRef.current
        if (!latest.enabled || !latest.valid) return false
        const changes = diffPayload(latest.payload, savedRef.current)
        if (changes === null) return true
        setSaving(true)
        try {
          await latest.save(changes)
        } catch (error) {
          setFailure({ payloadKey: JSON.stringify(latest.payload), error })
          return false
        }
        // Se da por guardado lo ENVIADO (no el estado actual, que pudo cambiar mientras tanto).
        savedRef.current = { ...savedRef.current, ...changes }
        setSaved(savedRef.current)
        setWrote(true)
      }
    })()
    inFlightRef.current = task
    void task.finally(() => {
      if (inFlightRef.current === task) inFlightRef.current = null
      setSaving(false)
    })
    return task
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const payloadKey = JSON.stringify(payload)
  const pending = enabled && (!valid || diffPayload(payload, saved) !== null)

  useEffect(() => {
    if (!enabled || !valid) return
    if (diffPayload(latestRef.current.payload, savedRef.current) === null) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void cycle()
    }, delayMs)
    return clearTimer
  }, [payloadKey, valid, enabled, delayMs, cycle, clearTimer])

  // Al salir de la pantalla se envía lo pendiente (la mutación sigue viva aunque el componente no).
  useEffect(
    () => () => {
      clearTimer()
      const latest = latestRef.current
      if (
        latest.enabled &&
        latest.valid &&
        diffPayload(latest.payload, savedRef.current) !== null
      ) {
        void cycle()
      }
    },
    [cycle, clearTimer],
  )

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimer()
    return cycle()
  }, [cycle, clearTimer])

  const activeFailure = failure !== null && failure.payloadKey === payloadKey ? failure : null
  let status: AutosaveStatus = 'idle'
  if (saving) status = 'saving'
  else if (activeFailure) status = 'error'
  else if (pending) status = 'dirty'
  else if (wrote) status = 'saved'

  return { status, error: activeFailure?.error ?? null, flush }
}

/** Resumen de varios grupos para un único indicador: error > guardando > pendiente > guardado. */
export function combineStatuses(statuses: readonly AutosaveStatus[]): AutosaveStatus {
  for (const wanted of ['error', 'saving', 'dirty', 'saved'] as const) {
    if (statuses.includes(wanted)) return wanted
  }
  return 'idle'
}
