import { useAuth } from '@/features/auth'
import { TodayView } from '@/features/agenda'

export function TodayPage() {
  const { user } = useAuth()
  if (!user) return null
  return <TodayView user={user} />
}
