import { useAuth } from '@/features/auth'
import { AgendaWorkspace } from '@/features/agenda'

export function AgendaPage() {
  const { user } = useAuth()
  if (!user) return null
  return <AgendaWorkspace user={user} />
}
