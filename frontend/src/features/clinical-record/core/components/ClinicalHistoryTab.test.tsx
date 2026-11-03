import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { makeSummary } from '@/test/clinical'
import { installFetch, jsonResponse, type RecordedCall } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'
import type { AllergyRead, EncounterSummary, Specialty } from '@/shared/types/aliases'

import { ClinicalHistoryTab } from './ClinicalHistoryTab'

afterEach(() => vi.unstubAllGlobals())

const PENICILLIN: AllergyRead = {
  id: 'al-1',
  substance: 'Penicilina',
  reaction: 'Anafilaxia',
  severity: 'SEVERE',
  status: 'ACTIVE',
  verified_at: '2026-10-01T10:00:00Z',
}

const ROW: EncounterSummary = {
  id: 'e-1',
  specialty: 'ACUPUNCTURE',
  status: 'SIGNED',
  occurred_at: '2026-11-03T14:00:00Z',
  doctor_name: 'Ana Torres',
  signed_at: '2026-11-03T15:00:00Z',
  primary_diagnosis_code: 'M54.5',
  primary_diagnosis_text: 'Lumbalgia baja',
  addenda_count: 2,
}

function setup(options: {
  canWrite?: boolean
  specialties?: Specialty[]
  summary?: ReturnType<typeof makeSummary>
  encounters?: EncounterSummary[]
  extra?: ((c: RecordedCall) => Response | undefined)[]
  onGoToConsents?: () => void
}) {
  const allergies = [PENICILLIN]
  const calls = installFetch(
    ...(options.extra ?? []),
    (c) =>
      c.url === '/api/patients/p-1/clinical-summary'
        ? jsonResponse(200, options.summary ?? makeSummary({ allergies }))
        : undefined,
    (c) =>
      c.method === 'GET' && c.url.startsWith('/api/patients/p-1/allergies')
        ? jsonResponse(200, allergies)
        : undefined,
    (c) =>
      c.method === 'GET' && c.url.startsWith('/api/patients/p-1/medications')
        ? jsonResponse(200, [])
        : undefined,
    (c) =>
      c.method === 'GET' && c.url.startsWith('/api/patients/p-1/conditions')
        ? jsonResponse(200, [])
        : undefined,
    (c) =>
      c.url.startsWith('/api/patients/p-1/encounters')
        ? jsonResponse(200, options.encounters ?? [ROW])
        : undefined,
  )
  renderWithAuth(
    <ClinicalHistoryTab
      patientId="p-1"
      canWrite={options.canWrite ?? true}
      specialties={options.specialties ?? ['ACUPUNCTURE']}
      {...(options.onGoToConsents ? { onGoToConsents: options.onGoToConsents } : {})}
    />,
    makeUser(['DOCTOR']),
  )
  return { calls, user: userEvent.setup() }
}

describe('ClinicalHistoryTab: alertas', () => {
  it('muestra arriba las alergias activas con su gravedad escrita, además del color', async () => {
    setup({})
    const banner = await screen.findByRole('region', { name: 'Alertas clínicas' })
    expect(within(banner).getByText('Penicilina')).toBeInTheDocument()
    expect(within(banner).getByText('Grave')).toBeInTheDocument()
    expect(within(banner).getByText('Anafilaxia')).toBeInTheDocument()
    expect(
      within(banner).getByText(/Alergias activas \(incluye alergia grave\)/),
    ).toBeInTheDocument()
  })

  it('sin consentimiento general vigente lo avisa y ofrece ir a Consentimientos', async () => {
    const onGoToConsents = vi.fn()
    const { user } = setup({
      summary: makeSummary({ consents: { general_care: false, data_processing: true } }),
      onGoToConsents,
    })
    expect(await screen.findByText('Sin consentimiento general vigente')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ir a Consentimientos' }))
    expect(onGoToConsents).toHaveBeenCalled()
  })

  it('con consentimiento general vigente no hay aviso; muestra contadores y último encuentro en hora de Lima', async () => {
    setup({
      summary: makeSummary({
        signed_encounters: 3,
        last_encounter_at: '2026-11-03T14:00:00Z',
      }),
    })
    expect(await screen.findByText(/3 encuentros firmados/)).toBeInTheDocument()
    expect(screen.getByText(/Último encuentro: .*9:00/)).toBeInTheDocument()
    expect(screen.queryByText('Sin consentimiento general vigente')).not.toBeInTheDocument()
  })
})

describe('ClinicalHistoryTab: línea de tiempo', () => {
  it('lista fecha de Lima, especialidad, doctor, estado, diagnóstico y adendas, con enlace al encuentro', async () => {
    setup({})
    const table = await screen.findByRole('table', { name: /Línea de tiempo/ })
    const row = within(table).getAllByRole('row')[1] as HTMLElement
    expect(within(row).getByText('Firmado')).toBeInTheDocument()
    expect(within(row).getByText('Acupuntura')).toBeInTheDocument()
    expect(within(row).getByText('Ana Torres')).toBeInTheDocument()
    expect(within(row).getByText('M54.5')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/pacientes/p-1/encuentros/e-1')
    expect(within(row).getByRole('link')).toHaveTextContent(/9:00/)
  })

  it('estado vacío cuando no hay encuentros', async () => {
    setup({ encounters: [] })
    expect(await screen.findByText('Aún no hay encuentros registrados.')).toBeInTheDocument()
  })

  it('pagina: pide una fila de más y habilita «Siguiente» solo si la hay', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ ...ROW, id: `e-${i}` }))
    const { calls, user } = setup({ encounters: many })
    await screen.findByRole('table', { name: /Línea de tiempo/ })
    expect(calls.find((c) => c.url.includes('/encounters'))?.url).toContain('limit=11')
    expect(screen.getAllByRole('link', { name: /abrir encuentro/ })).toHaveLength(10)
    const next = screen.getByRole('button', { name: 'Siguiente' })
    expect(next).toBeEnabled()
    await user.click(next)
    expect(calls.some((c) => c.url.includes('offset=10'))).toBe(true)
  })

  it('«Nuevo encuentro» solo para quien puede escribir; ofrece SUS especialidades', async () => {
    const { user } = setup({ specialties: ['ACUPUNCTURE', 'NUTRITION'] })
    await user.click(await screen.findByRole('button', { name: 'Nuevo encuentro' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo encuentro' })
    const options = within(dialog)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Acupuntura', 'Nutrición'])
  })

  it('un lector (dueño) no ve «Nuevo encuentro»', async () => {
    setup({ canWrite: false })
    await screen.findByRole('table', { name: /Línea de tiempo/ })
    expect(screen.queryByRole('button', { name: 'Nuevo encuentro' })).not.toBeInTheDocument()
  })
})

describe('ClinicalHistoryTab: antecedentes', () => {
  it('el doctor da de alta una alergia y la marca inactiva; NO existe borrar', async () => {
    const { calls, user } = setup({
      extra: [
        (c) =>
          c.method === 'POST' && c.url === '/api/patients/p-1/allergies'
            ? jsonResponse(201, { ...PENICILLIN, id: 'al-2', substance: 'Látex' })
            : undefined,
        (c) =>
          c.method === 'PATCH' && c.url === '/api/allergies/al-1'
            ? jsonResponse(200, { ...PENICILLIN, status: 'INACTIVE' })
            : undefined,
      ],
    })
    await user.click(await screen.findByRole('button', { name: 'Agregar alergia' }))
    const form = screen.getByRole('form', { name: 'Agregar alergia' })
    await user.click(within(form).getByRole('button', { name: 'Guardar alergia' }))
    expect(await within(form).findByText(/Indique la sustancia/)).toBeInTheDocument()
    await user.type(within(form).getByLabelText(/Sustancia/), ' Látex ')
    await user.selectOptions(within(form).getByLabelText(/Gravedad/), 'MILD')
    await user.click(within(form).getByRole('button', { name: 'Guardar alergia' }))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      substance: 'Látex',
      reaction: null,
      severity: 'MILD',
      verified: false,
    })

    await user.click(await screen.findByRole('button', { name: 'Marcar inactiva: Penicilina' }))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'INACTIVE' })
    expect(screen.queryByRole('button', { name: /eliminar|borrar/i })).not.toBeInTheDocument()
  })

  it('sin permiso de escritura no hay altas ni cambios de estado', async () => {
    setup({ canWrite: false })
    await screen.findByText('Penicilina', { selector: 'strong' })
    expect(screen.queryByRole('button', { name: 'Agregar alergia' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar medicación' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar antecedente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marcar inactiva/ })).not.toBeInTheDocument()
  })

  it('si el resumen da 403 explica el acceso y no sigue pidiendo el resto', async () => {
    const calls = installFetch(() =>
      jsonResponse(403, {
        error: {
          code: 'permission_denied',
          message: 'No tienes acceso al contenido clínico de este paciente',
        },
      }),
    )
    renderWithAuth(
      <ClinicalHistoryTab patientId="p-1" canWrite specialties={[]} />,
      makeUser(['DOCTOR']),
    )
    expect(await screen.findByText(/No tiene acceso a este contenido clínico/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(calls.every((c) => c.url.endsWith('clinical-summary'))).toBe(true)
  })
})
