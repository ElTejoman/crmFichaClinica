import { useParams } from 'react-router-dom'

import { ConvertLeadView } from '@/features/leads'

import { NotFoundPage } from './NotFoundPage'

export function LeadConvertPage() {
  const { leadId } = useParams()
  return leadId ? <ConvertLeadView key={leadId} leadId={leadId} /> : <NotFoundPage />
}
