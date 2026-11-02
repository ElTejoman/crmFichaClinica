import { useReadiness } from '../api/useReadiness'
import { describeStatus, type StatusView } from '../describeStatus'

const TONE_CLASS: Record<StatusView['tone'], string> = {
  ok: 'bg-brand-100 text-brand-700',
  warn: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
}

export function ApiStatus() {
  const { data, isPending, isError } = useReadiness()
  const view = describeStatus(isPending, isError, data?.status)
  return (
    <span
      role="status"
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${TONE_CLASS[view.tone]}`}
    >
      {view.label}
    </span>
  )
}
