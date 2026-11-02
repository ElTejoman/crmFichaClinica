import { Alert } from '@/shared/ui'

import { describeAgendaError } from '../serverErrors'

/** Error del servidor en una caja con `role="alert"`: la frase y, si hay, la lista de choques/sesiones. */
export function AgendaError({ error, title }: { error: unknown; title?: string }) {
  const view = describeAgendaError(error)
  return (
    <Alert tone="error" {...(title ? { title } : {})}>
      <p>{view.message}</p>
      {view.items.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {view.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </Alert>
  )
}
