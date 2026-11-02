import type { BadgeTone } from '@/shared/ui'

/** Vocabulario de auditoría (backend/app/domain/enums.py::AuditAction) en español. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  LOGIN_FAILED: 'Inicio de sesión fallido',
  LOGOUT: 'Cierre de sesión',
  TOKEN_REFRESH: 'Renovación de sesión',
  TOKEN_REUSE_DETECTED: 'Reutilización de token detectada',
  PERMISSION_DENIED: 'Permiso denegado',
  USER_CREATE: 'Usuario creado',
  USER_UPDATE: 'Usuario modificado',
  READ: 'Lectura',
  CREATE: 'Creación',
  UPDATE: 'Modificación',
  SIGN: 'Firma',
  AMEND: 'Adenda',
  EXPORT: 'Exportación',
  PRINT: 'Impresión',
  BREAK_GLASS: 'Acceso de emergencia',
}

export const AUDIT_ACTIONS: readonly string[] = Object.keys(AUDIT_ACTION_LABELS)

export function actionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}

interface OutcomeView {
  label: string
  tone: BadgeTone
  icon: string
}

/** Resultado = color + texto + icono (WCAG 1.4.1: el color no es el único canal). */
const OUTCOME_VIEWS: Record<string, OutcomeView> = {
  SUCCESS: { label: 'Éxito', tone: 'success', icon: '✓' },
  DENIED: { label: 'Denegado', tone: 'warning', icon: '⊘' },
  FAILURE: { label: 'Fallo', tone: 'danger', icon: '✕' },
}

export function outcomeView(outcome: string): OutcomeView {
  return OUTCOME_VIEWS[outcome] ?? { label: outcome, tone: 'neutral', icon: '?' }
}
