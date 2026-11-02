import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'
import { readFlash } from '@/shared/lib/flash'
import type { LeadRead } from '@/shared/types/aliases'

import { ConvertLeadView } from './ConvertLeadView'

const lead: LeadRead = {
  id: 'lead-1',
  full_name: 'Juan Carlos Pérez Gómez',
  phone: '+51912345678',
  email: 'juan@correo.pe',
  interest_specialties: ['NUTRITION'],
  source: 'INSTAGRAM',
  status: 'QUALIFIED',
  status_changed_at: '2026-03-10T15:00:00Z',
  next_action_at: null,
  assigned_to: null,
  assigned_to_name: null,
  consent_marketing: true,
  converted_patient_id: null,
  updated_at: '2026-03-10T15:00:00Z',
  lost_reason: null,
  notes: null,
  created_at: '2026-03-01T15:00:00Z',
  activities: [],
}

function Landing() {
  const location = useLocation()
  return (
    <p>
      Ficha {location.pathname} · {readFlash(location.state)}
    </p>
  )
}

function renderConvert() {
  return renderWithAuth(
    <Routes>
      <Route path="/leads/:leadId/convertir" element={<ConvertLeadView leadId="lead-1" />} />
      <Route path="/pacientes/:id" element={<Landing />} />
    </Routes>,
    makeUser(['RECEPTION']),
    '/leads/lead-1/convertir',
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('ConvertLeadView', () => {
  it('pre-rellena el formulario de paciente desde el lead', async () => {
    installFetch((c) => (c.url === '/api/leads/lead-1' ? jsonResponse(200, lead) : undefined))
    renderConvert()
    expect(await screen.findByLabelText(/Nombres/)).toHaveValue('Juan Carlos')
    expect(screen.getByLabelText(/Apellidos/)).toHaveValue('Pérez Gómez')
    const contact = within(screen.getByRole('group', { name: 'Contacto' }))
    expect(contact.getByLabelText(/^Teléfono/)).toHaveValue('+51912345678')
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveValue('juan@correo.pe')
    expect(screen.getByLabelText(/¿Cómo nos conoció\?/)).toHaveValue('INSTAGRAM')
    // Lo que el lead no tiene queda pendiente para el usuario.
    expect(screen.getByLabelText(/N\.º de documento/)).toHaveValue('')
    expect(screen.getByLabelText(/Fecha de nacimiento/)).toHaveValue('')
  })

  it('al convertir envía {patient} y aterriza en la ficha con el código de HC', async () => {
    const calls = installFetch(
      (c) =>
        c.url === '/api/leads/lead-1' && c.method === 'GET' ? jsonResponse(200, lead) : undefined,
      (c) => (c.url.startsWith('/api/patients/duplicates') ? jsonResponse(200, []) : undefined),
      (c) =>
        c.url === '/api/leads/lead-1/convert'
          ? jsonResponse(200, {
              lead: { ...lead, status: 'CONVERTED' },
              patient_id: 'p-42',
              hc_number: 42,
            })
          : undefined,
    )
    const user = userEvent.setup()
    renderConvert()
    await screen.findByLabelText(/Nombres/)

    await user.type(screen.getByLabelText(/N\.º de documento/), '90001234')
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-05-01')
    await user.selectOptions(screen.getByLabelText(/Sexo/), 'MALE')
    await user.click(screen.getByRole('checkbox', { name: /autoriza el tratamiento/ }))
    await user.click(screen.getByRole('button', { name: 'Crear paciente y convertir' }))

    expect(await screen.findByText(/Ficha \/pacientes\/p-42/)).toBeInTheDocument()
    expect(screen.getByText(/Historia clínica HC-000042/)).toBeInTheDocument()
    const convert = calls.find((c) => c.url.endsWith('/convert'))
    expect(convert?.body).toMatchObject({
      patient: {
        document_number: '90001234',
        first_name: 'Juan Carlos',
        last_name: 'Pérez Gómez',
        referral_source: 'INSTAGRAM',
        data_processing_consent: true,
      },
    })
  })

  it('un lead ya convertido no ofrece el formulario', async () => {
    installFetch((c) =>
      c.url === '/api/leads/lead-1'
        ? jsonResponse(200, { ...lead, status: 'CONVERTED', converted_patient_id: 'p-1' })
        : undefined,
    )
    renderConvert()
    expect(await screen.findByText(/ya fue convertido/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByLabelText(/Nombres/)).not.toBeInTheDocument())
  })
})
