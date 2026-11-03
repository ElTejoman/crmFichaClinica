import { Alert } from '@/shared/ui'

import { describeClinicalError } from '../serverErrors'

/** Error del API clínico en una caja `role="alert"`; el 403 se explica, no se muestra como fallo. */
export function ClinicalError({ error, title }: { error: unknown; title?: string }) {
  return (
    <Alert tone="error" {...(title ? { title } : {})}>
      {describeClinicalError(error)}
    </Alert>
  )
}
