import { useAuth } from '@/features/auth'
import { MyAgendaView } from '@/features/agenda'

export function MyAgendaPage() {
  const { user } = useAuth()
  if (!user) return null
  return <MyAgendaView user={user} />
}
