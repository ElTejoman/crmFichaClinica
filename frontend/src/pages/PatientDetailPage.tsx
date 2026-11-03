import { useParams } from 'react-router-dom'

import { can } from '@/entities/user'
import { useAuth } from '@/features/auth'
import { AttachmentsPanel, ClinicalHistoryTab, ConsentsPanel } from '@/features/clinical-record'
import { PatientDetail, type PatientExtraTab } from '@/features/patients'

import { NotFoundPage } from './NotFoundPage'

/**
 * Compone la ficha del paciente con las pestañas clínicas que el rol permite. Es la página (y no
 * `features/patients`) quien conoce `features/clinical-record`: las features no se importan entre sí.
 */
export function PatientDetailPage() {
  const { user } = useAuth()
  const { patientId } = useParams()
  if (!patientId) return <NotFoundPage />

  const roles = user?.roles
  const canReadClinical = can(roles, 'clinical:read')
  const canWriteClinical = can(roles, 'clinical:write')
  const canCapture = can(roles, 'consents:capture')
  const specialties = user?.doctor_profile?.specialties ?? []

  const extraTabs: PatientExtraTab[] = []
  if (canReadClinical) {
    extraTabs.push({
      id: 'historia',
      label: 'Historia clínica',
      render: (_patient, goToTab) => (
        <ClinicalHistoryTab
          patientId={patientId}
          canWrite={canWriteClinical}
          specialties={specialties}
          onGoToConsents={() => goToTab('consentimientos')}
        />
      ),
    })
  }
  if (canCapture) {
    extraTabs.push({
      id: 'consentimientos',
      label: 'Consentimientos',
      render: (patient) => (
        <ConsentsPanel
          patientId={patientId}
          patient={{
            fullName: patient.full_name,
            isMinor: patient.is_minor,
            guardian: patient.guardian,
          }}
          canCapture={canCapture}
          canViewSignature={canReadClinical}
        />
      ),
    })
  }
  if (canReadClinical) {
    extraTabs.push({
      id: 'adjuntos',
      label: 'Adjuntos',
      render: () => <AttachmentsPanel patientId={patientId} canUpload={canWriteClinical} />,
    })
  }

  // `key` reinicia el estado (edición, mensajes) al pasar de un paciente a otro.
  return (
    <PatientDetail
      key={patientId}
      patientId={patientId}
      canManage={can(roles, 'patients:manage')}
      canViewAppointments={can(roles, 'agenda:read')}
      canSchedule={can(roles, 'agenda:manage')}
      extraTabs={extraTabs}
    />
  )
}
