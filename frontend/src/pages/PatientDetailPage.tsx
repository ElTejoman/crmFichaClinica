import { useParams } from 'react-router-dom'

import { can } from '@/entities/user'
import { useAuth } from '@/features/auth'
import { PatientDetail } from '@/features/patients'

import { NotFoundPage } from './NotFoundPage'

export function PatientDetailPage() {
  const { user } = useAuth()
  const { patientId } = useParams()
  if (!patientId) return <NotFoundPage />
  // `key` reinicia el estado (edición, mensajes) al pasar de un paciente a otro.
  return (
    <PatientDetail
      key={patientId}
      patientId={patientId}
      canManage={can(user?.roles, 'patients:manage')}
    />
  )
}
