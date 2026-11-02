import { FOCUS_RING } from './focus'

const CONTROL_CLASS = `block w-full min-h-10 rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 disabled:bg-slate-100 ${FOCUS_RING}`

/** Clases comunes de Input/Select; borde rojo cuando el campo es inválido. */
export function controlClass(invalid: boolean | undefined): string {
  return `${CONTROL_CLASS} ${invalid ? 'border-red-700' : 'border-slate-400'}`
}
