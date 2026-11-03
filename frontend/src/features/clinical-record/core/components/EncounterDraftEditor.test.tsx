import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DOCTOR_ID, makeEncounter, makeSummary, makeVital } from '@/test/clinical'
import { installClinicalApi } from '@/test/clinicalApi'
import { jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { AUTOSAVE_DELAY_MS } from '../hooks/useAutosave'
import { EncounterWorkspace } from './EncounterWorkspace'

const doctor = makeUser(['DOCTOR'], { id: DOCTOR_ID })
const VIEWER = { id: DOCTOR_ID, roles: doctor.roles }

function renderEditor() {
  return renderWithAuth(
    <EncounterWorkspace patientId="p-1" encounterId="e-1" viewer={VIEWER} />,
    doctor,
  )
}

function setupUser() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

/** Deja pasar el debounce del autoguardado y las respuestas pendientes. */
async function passDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 200)
  })
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('EncounterWorkspace: borrador del doctor', () => {
  it('muestra el editor SOAP con vitales, diagnósticos, checklist y la nota del módulo', async () => {
    installClinicalApi({ encounter: makeEncounter() })
    renderEditor()
    expect(await screen.findByRole('form', { name: 'Editor del encuentro' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Motivo de consulta y relato/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Examen físico/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Evaluación clínica/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Plan de tratamiento/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Buscar diagnóstico/ })).toBeInTheDocument()
    expect(
      screen.getByText(/módulo de esta especialidad se habilita en una fase posterior/),
    ).toBeInTheDocument()
    expect(await screen.findByText(/Falta el motivo de consulta/)).toBeInTheDocument()
  })

  it('autoguarda con debounce: varias teclas = UN PATCH con solo el campo cambiado', async () => {
    const api = installClinicalApi({ encounter: makeEncounter() })
    const user = setupUser()
    renderEditor()
    const field = await screen.findByLabelText(/Motivo de consulta y relato/)

    await user.type(field, 'Dolor lumbar')
    expect(api.patches()).toHaveLength(0) // aún no pasó el debounce
    expect(screen.getByText('Cambios sin guardar…')).toBeInTheDocument()

    await passDebounce()
    expect(api.patches()).toHaveLength(1)
    expect(api.patches()[0]?.body).toEqual({ subjective: 'Dolor lumbar' })
    expect(await screen.findByText('Guardado')).toBeInTheDocument()
  })

  it('NO envía el IMC: manda peso y talla y muestra el IMC que calcula el servidor', async () => {
    const api = installClinicalApi({ encounter: makeEncounter() })
    const user = setupUser()
    renderEditor()
    await user.type(await screen.findByLabelText(/Peso \(kg\)/), '70,5')
    await user.type(screen.getByLabelText(/Talla \(cm\)/), '170')
    await passDebounce()

    expect(api.patches()).toHaveLength(1)
    const body = api.patches()[0]?.body
    expect(body).toEqual({ vitals: [{ context: 'SINGLE', weight_kg: 70.5, height_cm: 170 }] })
    expect(JSON.stringify(body)).not.toContain('bmi')
    expect(await screen.findByText(/IMC 24,4 kg\/m²/)).toBeInTheDocument()
    expect(screen.getByText(/calculado por el servidor/)).toBeInTheDocument()
  })

  it('un valor mal escrito se marca y NO se envía; lo demás sigue guardándose', async () => {
    const api = installClinicalApi({ encounter: makeEncounter() })
    const user = setupUser()
    renderEditor()
    await user.type(await screen.findByLabelText(/Frecuencia cardiaca/), '7x')
    await user.type(screen.getByLabelText(/Plan de tratamiento/), 'Reposo')
    await passDebounce()

    expect(screen.getByText('Escriba un número')).toBeInTheDocument()
    expect(api.patches().map((c) => c.body)).toEqual([{ plan: 'Reposo' }])
    expect(screen.getByText(/no se guardan hasta que sean válidos/)).toBeInTheDocument()
  })

  it('el rechazo del servidor (invalid_vitals) se explica junto a los vitales y no frena el resto', async () => {
    let rejectVitals = true
    const api = installClinicalApi({
      encounter: makeEncounter(),
      extra: [
        (c) =>
          c.method === 'PATCH' && rejectVitals && JSON.stringify(c.body).includes('vitals')
            ? jsonResponse(422, {
                error: {
                  code: 'invalid_vitals',
                  message: 'Frecuencia cardiaca fuera de rango plausible (20 a 250)',
                },
              })
            : undefined,
      ],
    })
    const user = setupUser()
    renderEditor()
    await user.type(await screen.findByLabelText(/Frecuencia cardiaca/), '5')
    await user.type(screen.getByLabelText(/Plan de tratamiento/), 'Reposo')
    await passDebounce()

    expect(
      await screen.findByText(/Frecuencia cardiaca fuera de rango plausible/),
    ).toBeInTheDocument()
    expect(screen.getByText('Error al guardar')).toBeInTheDocument()
    // El plan sí se guardó (grupo independiente).
    expect(api.state.encounter.plan).toBe('Reposo')

    rejectVitals = false
    await user.type(screen.getByLabelText(/Frecuencia cardiaca/), '0')
    await passDebounce()
    expect(await screen.findByText('Guardado')).toBeInTheDocument()
  })

  it('"Revisé las alergias y la medicación" se envía como history_reviewed y se lista lo registrado', async () => {
    const api = installClinicalApi({
      encounter: makeEncounter(),
      summary: makeSummary({
        allergies: [
          {
            id: 'al-1',
            substance: 'Penicilina',
            reaction: null,
            severity: 'SEVERE',
            status: 'ACTIVE',
            verified_at: null,
          },
        ],
      }),
    })
    const user = setupUser()
    renderEditor()
    const box = await screen.findByLabelText(/Revisé las alergias y la medicación/)
    const review = screen.getByRole('region', { name: 'Revisión de antecedentes' })
    expect(await within(review).findByText('Penicilina')).toBeInTheDocument()
    await user.click(box)
    await passDebounce()
    expect(api.patches().map((c) => c.body)).toEqual([{ history_reviewed: true }])
  })

  it('agrega un diagnóstico desde el buscador y lo envía con un único principal', async () => {
    const api = installClinicalApi({ encounter: makeEncounter() })
    const user = setupUser()
    renderEditor()
    await user.type(await screen.findByRole('combobox', { name: /Buscar diagnóstico/ }), 'lumb')
    await user.click(await screen.findByRole('option', { name: /M54.5/ }))
    expect(screen.getByRole('radio', { name: /Principal/ })).toBeChecked()
    await passDebounce()
    expect(api.patches().map((c) => c.body)).toEqual([
      {
        diagnoses: [
          {
            icd10_code: 'M54.5',
            description: 'Lumbalgia baja',
            type: 'DEFINITIVE',
            is_primary: true,
          },
        ],
      },
    ])
    expect(screen.getByRole('button', { name: 'Quitar diagnóstico M54.5' })).toBeInTheDocument()
  })

  it('una serie PRE/POST de sueroterapia se envía como lista de mediciones con su momento', async () => {
    const api = installClinicalApi({ encounter: makeEncounter({ specialty: 'IV_THERAPY' }) })
    const user = setupUser()
    renderEditor()
    await user.click(await screen.findByRole('radio', { name: /Serie antes/ }))
    const hr = screen.getAllByLabelText(/Frecuencia cardiaca/)
    expect(hr).toHaveLength(2)
    await user.type(hr[0] as HTMLElement, '80')
    await user.type(hr[1] as HTMLElement, '72')
    await passDebounce()
    expect(api.patches().map((c) => c.body)).toEqual([
      {
        vitals: [
          { context: 'PRE', heart_rate: 80 },
          { context: 'POST', heart_rate: 72 },
        ],
      },
    ])
  })

  it('"no aplica" pide motivo y lo guarda; con vitales escritos la casilla queda bloqueada', async () => {
    const api = installClinicalApi({ encounter: makeEncounter() })
    const user = setupUser()
    renderEditor()
    await user.click(await screen.findByLabelText(/signos vitales no aplican/))
    await user.type(screen.getByLabelText(/Motivo por el que no aplican/), 'Control telefónico')
    await passDebounce()
    expect(api.patches().map((c) => c.body)).toContainEqual({
      vitals_not_applicable_reason: 'Control telefónico',
    })
  })
})

describe('EncounterWorkspace: checklist y firma', () => {
  const complete = () =>
    makeEncounter({
      subjective: 'Dolor lumbar',
      plan: 'Reposo',
      history_reviewed_at: '2026-11-03T14:00:00Z',
      vitals: [makeVital()],
      diagnoses: [
        {
          icd10_code: 'M54.5',
          description: 'Lumbalgia baja',
          type: 'DEFINITIVE',
          is_primary: true,
        },
      ],
    })

  it('lista lo que falta y mantiene Firmar deshabilitado mientras can_sign sea false', async () => {
    installClinicalApi({ encounter: makeEncounter() })
    renderEditor()
    const list = await screen.findByRole('list', { name: 'Requisitos pendientes' })
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4)
    expect(screen.getByRole('button', { name: 'Firmar encuentro' })).toBeDisabled()
  })

  it('se refresca tras guardar: al cumplirse el último requisito se habilita Firmar', async () => {
    installClinicalApi({ encounter: makeEncounter({ ...complete(), plan: null }) })
    const user = setupUser()
    renderEditor()
    expect(await screen.findByText('Falta el plan de tratamiento (P)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Firmar encuentro' })).toBeDisabled()

    await user.type(screen.getByLabelText(/Plan de tratamiento/), 'Reposo')
    // Con cambios sin guardar nunca se habilita (el checklist del servidor está desactualizado).
    expect(screen.getByRole('button', { name: 'Firmar encuentro' })).toBeDisabled()
    await passDebounce()
    expect(await screen.findByText(/Todos los requisitos están cumplidos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Firmar encuentro' })).toBeEnabled()
  })

  it('aunque el checklist diga can_sign, con cambios sin guardar Firmar sigue deshabilitado', async () => {
    installClinicalApi({ encounter: complete() })
    const user = setupUser()
    renderEditor()
    const sign = await screen.findByRole('button', { name: 'Firmar encuentro' })
    await vi.waitFor(() => expect(sign).toBeEnabled())

    await user.type(screen.getByLabelText(/Plan de tratamiento/), ' y control')
    expect(screen.getByRole('button', { name: 'Firmar encuentro' })).toBeDisabled()
    expect(screen.getByText(/Espere a que terminen de guardarse/)).toBeInTheDocument()

    await passDebounce()
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Firmar encuentro' })).toBeEnabled(),
    )
  })

  it('con un valor inválido pendiente tampoco se puede firmar y se explica por qué', async () => {
    installClinicalApi({ encounter: complete() })
    const user = setupUser()
    renderEditor()
    const sign = await screen.findByRole('button', { name: 'Firmar encuentro' })
    await vi.waitFor(() => expect(sign).toBeEnabled())
    await user.type(screen.getByLabelText(/Frecuencia respiratoria/), 'abc')
    await passDebounce()
    expect(screen.getByRole('button', { name: 'Firmar encuentro' })).toBeDisabled()
    expect(screen.getByText(/Corrija los campos marcados en la ficha/)).toBeInTheDocument()
  })

  it('Firmar pide confirmación que avisa que será inmutable; Cancelar no firma', async () => {
    const api = installClinicalApi({ encounter: complete() })
    const user = setupUser()
    renderEditor()
    const sign = await screen.findByRole('button', { name: 'Firmar encuentro' })
    await vi.waitFor(() => expect(sign).toBeEnabled())
    await user.click(sign)
    const dialog = await screen.findByRole('dialog', { name: 'Firmar encuentro' })
    expect(within(dialog).getByText(/queda inmutable/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(api.calls.some((c) => c.url.endsWith('/sign'))).toBe(false)
  })

  it('al confirmar firma y la pantalla pasa a solo lectura con firmante y colegiatura', async () => {
    const signed = makeEncounter({
      ...complete(),
      status: 'SIGNED',
      signed_at: '2026-11-03T15:30:00Z',
      signer_name: 'Ana Torres',
      signer_license: 'CMP 12345',
    })
    const api = installClinicalApi({
      encounter: complete(),
      extra: [
        (c) =>
          c.method === 'POST' && c.url === '/api/encounters/e-1/sign'
            ? jsonResponse(200, signed)
            : undefined,
      ],
    })
    const user = setupUser()
    renderEditor()
    const sign = await screen.findByRole('button', { name: 'Firmar encuentro' })
    await vi.waitFor(() => expect(sign).toBeEnabled())
    await user.click(sign)
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Firmar y cerrar' }),
    )

    expect(await screen.findByText('Firmado electrónicamente')).toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'POST' && c.url === '/api/encounters/e-1/sign')).toBe(
      true,
    )
    // Ya no hay campos editables ni autoguardado.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Editor del encuentro' })).not.toBeInTheDocument()
    expect(screen.getByText(/CMP 12345/)).toBeInTheDocument()
  })

  it('si el servidor responde signing_blocked muestra lo que falta y no firma', async () => {
    installClinicalApi({
      encounter: complete(),
      extra: [
        (c) =>
          c.method === 'POST' && c.url === '/api/encounters/e-1/sign'
            ? jsonResponse(422, {
                error: {
                  code: 'signing_blocked',
                  message: 'Faltan requisitos para firmar',
                  details: {
                    missing: [
                      {
                        code: 'general_consent',
                        message: 'El paciente no tiene un consentimiento general vigente',
                      },
                    ],
                  },
                },
              })
            : undefined,
      ],
    })
    const user = setupUser()
    renderEditor()
    const sign = await screen.findByRole('button', { name: 'Firmar encuentro' })
    await vi.waitFor(() => expect(sign).toBeEnabled())
    await user.click(sign)
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Firmar y cerrar' }),
    )

    const alert = await screen.findByText('El servidor no permitió firmar')
    expect(alert).toBeInTheDocument()
    expect(
      screen.getByText('El paciente no tiene un consentimiento general vigente'),
    ).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Editor del encuentro' })).toBeInTheDocument()
  })

  it('encounter_not_editable al autoguardar avisa que ya no es borrador', async () => {
    installClinicalApi({
      encounter: makeEncounter(),
      extra: [
        (c) =>
          c.method === 'PATCH'
            ? jsonResponse(409, {
                error: {
                  code: 'encounter_not_editable',
                  message: 'El encuentro ya está firmado y no se puede editar: registre una adenda',
                },
              })
            : undefined,
      ],
    })
    const user = setupUser()
    renderEditor()
    await user.type(await screen.findByLabelText(/Plan de tratamiento/), 'x')
    await passDebounce()
    expect(await screen.findByText('El encuentro ya no es un borrador')).toBeInTheDocument()
  })

  it('el botón del checklist ofrece ir directo a los requisitos de firma', async () => {
    installClinicalApi({ encounter: makeEncounter() })
    renderEditor()
    expect(await screen.findByRole('link', { name: 'Ir a requisitos de firma' })).toHaveAttribute(
      'href',
      '#firma',
    )
  })
})
