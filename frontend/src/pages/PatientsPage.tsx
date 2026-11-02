import { can } from '@/entities/user'
import { useAuth } from '@/features/auth'
import { PatientsList } from '@/features/patients'

export function PatientsPage() {
  const { user } = useAuth()
  return <PatientsList canManage={can(user?.roles, 'patients:manage')} />
}
