import { screen } from '@testing-library/react'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'
import type { PatientRead } from '@/shared/types/aliases'

import { PatientDetail } from './PatientDetail'

const patient: PatientRead = {
  id: 'p-1',
  document_type: 'DNI',
  document_number: '90001234',
  first_name: 'Rosa',
  last_name: 'Quispe',
  full_name: 'Rosa Quispe',
  birth_date: '1990-05-01',
  sex: 'FEMALE',
  marital_status: null,
  occupation: null,
  address: null,
  district: null,
  phone: '+51912345678',
  email: null,
  insurance: null,
  referral_source: null,
  emergency_contact: null,
  guardian: null,
  hc_number: 7,
  data_processing_consent_at: '2026-03-10T15:00:00Z',
  is_active: true,
  created_at: '2026-03-10T15:00:00Z',
  hc_code: 'HC-000007',
  age: 36,
  is_minor: false,
}

afterEach(() => vi.unstubAllGlobals())

describe('PatientDetail', () => {
  it('un doctor sin relación terapéutica ve un mensaje claro (403 del servidor)', async () => {
    installFetch(() =>
      jsonResponse(403, {
        error: { code: 'permission_denied', message: 'Sin relación terapéutica con el paciente' },
      }),
    )
    renderWithAuth(<PatientDetail patientId="p-1" canManage={false} />, makeUser(['DOCTOR']))
    expect(
      await screen.findByText('No tienes una relación terapéutica con este paciente.'),
    ).toBeInTheDocument()
  })

  it('muestra la ficha administrativa, el HC y aclara que no es clínica', async () => {
    installFetch((c) => (c.url === '/api/patients/p-1' ? jsonResponse(200, patient) : undefined))
    renderWithAuth(<PatientDetail patientId="p-1" canManage={false} />, makeUser(['DOCTOR']))
    expect(await screen.findByRole('heading', { name: 'Rosa Quispe' })).toBeInTheDocument()
    expect(screen.getByText('Historia clínica HC-000007')).toBeInTheDocument()
    expect(screen.getByText(/solo se muestran datos administrativos/)).toBeInTheDocument()
    expect(screen.getByText('01/05/1990')).toBeInTheDocument()
    // Sin permiso de gestión: ni editar, ni archivar, ni equipo tratante.
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByText('Equipo tratante')).not.toBeInTheDocument()
  })

  it('quien gestiona ve Editar, Archivar y el equipo tratante', async () => {
    installFetch(
      (c) => (c.url === '/api/patients/p-1' ? jsonResponse(200, patient) : undefined),
      (c) => (c.url === '/api/patients/p-1/care-team' ? jsonResponse(200, []) : undefined),
      (c) => (c.url === '/api/doctors' ? jsonResponse(200, []) : undefined),
    )
    renderWithAuth(<PatientDetail patientId="p-1" canManage />, makeUser(['RECEPTION']))
    expect(await screen.findByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archivar' })).toBeInTheDocument()
    expect(await screen.findByText('Todavía no hay doctores asignados.')).toBeInTheDocument()
  })
})
