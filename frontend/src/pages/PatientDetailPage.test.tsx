import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { makeConsent, makePatient } from '@/test/clinical'
import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'
import type { Role } from '@/shared/types/aliases'

import { PatientDetailPage } from './PatientDetailPage'

afterEach(() => vi.unstubAllGlobals())

function renderAs(roles: Role[], route = '/pacientes/p-1') {
  installFetch(
    (c) => (c.url === '/api/patients/p-1' ? jsonResponse(200, makePatient()) : undefined),
    (c) => (c.url.startsWith('/api/appointments?') ? jsonResponse(200, []) : undefined),
    (c) => (c.url === '/api/patients/p-1/care-team' ? jsonResponse(200, []) : undefined),
    (c) => (c.url === '/api/doctors' ? jsonResponse(200, []) : undefined),
    (c) =>
      c.url === '/api/patients/p-1/consents' ? jsonResponse(200, [makeConsent()]) : undefined,
    (c) =>
      c.url === '/api/patients/p-1/clinical-summary'
        ? jsonResponse(200, {
            allergies: [],
            medications: [],
            conditions: [],
            last_vitals: null,
            last_encounter_at: null,
            signed_encounters: 0,
            consents: { general_care: true, data_processing: true },
          })
        : undefined,
    (c) => (c.url.startsWith('/api/patients/p-1/') ? jsonResponse(200, []) : undefined),
  )
  return renderWithAuth(
    <Routes>
      <Route path="/pacientes/:patientId" element={<PatientDetailPage />} />
    </Routes>,
    makeUser(roles),
    route,
  )
}

async function tabNames() {
  await screen.findByRole('heading', { name: 'Rosa Quispe' })
  return screen.queryAllByRole('tab').map((t) => t.textContent)
}

describe('PatientDetailPage: pestañas clínicas por permiso', () => {
  it('el doctor ve Datos, Historia clínica, Consentimientos y Adjuntos', async () => {
    renderAs(['DOCTOR'])
    expect(await tabNames()).toEqual(['Datos', 'Historia clínica', 'Consentimientos', 'Adjuntos'])
  })

  it('el dueño también las ve (lectura clínica)', async () => {
    renderAs(['OWNER'])
    expect(await tabNames()).toEqual(['Datos', 'Historia clínica', 'Consentimientos', 'Adjuntos'])
  })

  it('recepción solo ve Consentimientos: nunca historia clínica ni adjuntos', async () => {
    renderAs(['RECEPTION'])
    expect(await tabNames()).toEqual(['Datos', 'Consentimientos'])
  })

  it('el superusuario no ve ninguna pestaña clínica y no hay barra de pestañas', async () => {
    renderAs(['SUPERUSER'])
    expect(await tabNames()).toEqual([])
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('la pestaña activa viaja en ?tab= y por defecto se abre «Datos»', async () => {
    renderAs(['DOCTOR'], '/pacientes/p-1?tab=consentimientos')
    expect(
      await screen.findByRole('tab', { name: 'Consentimientos', selected: true }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Consentimientos', level: 3 }),
    ).toBeInTheDocument()
  })

  it('un ?tab= al que el rol no tiene derecho cae en «Datos» (recepción pidiendo historia)', async () => {
    renderAs(['RECEPTION'], '/pacientes/p-1?tab=historia')
    expect(await screen.findByRole('tab', { name: 'Datos', selected: true })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Alertas clínicas' })).not.toBeInTheDocument()
  })

  it('la imagen de la firma es acceso clínico: el doctor ve «Ver firma», recepción no', async () => {
    const doctor = renderAs(['DOCTOR'], '/pacientes/p-1?tab=consentimientos')
    expect(await screen.findByRole('button', { name: /Ver firma/ })).toBeInTheDocument()
    doctor.unmount()

    renderAs(['RECEPTION'], '/pacientes/p-1?tab=consentimientos')
    await screen.findByText('Vigente')
    expect(screen.queryByRole('button', { name: /Ver firma/ })).not.toBeInTheDocument()
  })

  it('solo el doctor sube adjuntos; el dueño los ve sin formulario de subida', async () => {
    const owner = renderAs(['OWNER'], '/pacientes/p-1?tab=adjuntos')
    await screen.findByRole('heading', { name: 'Adjuntos', level: 3 })
    expect(screen.queryByRole('form', { name: 'Subir adjunto' })).not.toBeInTheDocument()
    owner.unmount()

    renderAs(['DOCTOR'], '/pacientes/p-1?tab=adjuntos')
    expect(await screen.findByRole('form', { name: 'Subir adjunto' })).toBeInTheDocument()
  })
})
