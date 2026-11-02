import { useParams } from 'react-router-dom'

import { can } from '@/entities/user'
import { useAuth } from '@/features/auth'
import { LeadDetail } from '@/features/leads'

import { NotFoundPage } from './NotFoundPage'

export function LeadDetailPage() {
  const { user } = useAuth()
  const { leadId } = useParams()
  if (!user || !leadId) return <NotFoundPage />
  return (
    <LeadDetail
      key={leadId}
      leadId={leadId}
      currentUser={{ id: user.id, full_name: user.full_name }}
      canManage={can(user.roles, 'leads:manage')}
      canConvert={can(user.roles, 'leads:manage') && can(user.roles, 'patients:manage')}
    />
  )
}
