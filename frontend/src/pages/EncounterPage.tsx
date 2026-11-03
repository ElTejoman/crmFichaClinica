import { useParams } from 'react-router-dom'

import { useAuth } from '@/features/auth'
import { EncounterWorkspace } from '@/features/clinical-record'

import { NotFoundPage } from './NotFoundPage'

export function EncounterPage() {
  const { user } = useAuth()
  const { patientId, encounterId } = useParams()
  if (!user || !patientId || !encounterId) return <NotFoundPage />
  // `key` reinicia el editor (estado, autoguardado) al abrir otro encuentro.
  return (
    <EncounterWorkspace
      key={encounterId}
      patientId={patientId}
      encounterId={encounterId}
      viewer={{ id: user.id, roles: user.roles }}
    />
  )
}
