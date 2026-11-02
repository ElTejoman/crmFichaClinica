import { can } from '@/entities/user'
import { useAuth } from '@/features/auth'
import { LeadsWorkspace } from '@/features/leads'

export function LeadsPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <LeadsWorkspace
      currentUser={{ id: user.id, full_name: user.full_name }}
      canManage={can(user.roles, 'leads:manage')}
      canViewReports={can(user.roles, 'leads:reports')}
    />
  )
}
