import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { makeConsent } from '@/test/clinical'
import { installFetch, jsonResponse, type RecordedCall } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'
import type { ConsentRead } from '@/shared/types/aliases'

import type { ConsentPatient } from './ConsentCaptureDialog'
import { ConsentsPanel } from './ConsentsPanel'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const LEGAL_NOTICE = 'EJEMPLO — NO CONSTITUYE UN TEXTO LEGAL VALIDADO'

const TEMPLATES = [
  {
    id: 't-0',
    type: 'GENERAL_CARE',
    version: 1,
    title: 'Consentimiento de atención general (antiguo)',
    body: 'Texto viejo que no debe mostrarse',
  },
  {
    id: 't-1',
    type: 'GENERAL_CARE',
    version: 2,
    title: 'Consentimiento de atención general',
    body: `${LEGAL_NOTICE}\n\nYo autorizo la atención.`,
  },
  {
    id: 't-2',
    type: 'IV_THERAPY',
    version: 1,
    title: 'Consentimiento de sueroterapia',
    body: `${LEGAL_NOTICE}\n\nProcedimiento intravenoso.`,
  },
]

const ADULT: ConsentPatient = { fullName: 'Rosa Quispe', isMinor: false, guardian: null }
const MINOR: ConsentPatient = {
  fullName: 'Luis Quispe',
  isMinor: true,
  guardian: {
    name: 'Marta Quispe',
    document_type: 'DNI',
    document_number: '40001234',
    phone: '+51911111111',
    relation: 'Madre',
  },
}

function mockCanvas() {
  const context = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG)
}

function sign() {
  const canvas = screen.getByRole('img', { name: /Área de firma/ })
  fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
}

function setup(options: {
  consents?: ConsentRead[]
  patient?: ConsentPatient
  roles?: Parameters<typeof makeUser>[0]
  canViewSignature?: boolean
  extra?: ((c: RecordedCall) => Response | undefined)[]
}) {
  const calls = installFetch(
    ...(options.extra ?? []),
    (c) =>
      c.method === 'GET' && c.url === '/api/patients/p-1/consents'
        ? jsonResponse(200, options.consents ?? [])
        : undefined,
    (c) => (c.url === '/api/consent-templates' ? jsonResponse(200, TEMPLATES) : undefined),
  )
  const roles = options.roles ?? ['DOCTOR']
  renderWithAuth(
    <ConsentsPanel
      patientId="p-1"
      patient={options.patient ?? ADULT}
      canCapture
      canViewSignature={options.canViewSignature ?? true}
    />,
    makeUser(roles),
  )
  return { calls, user: userEvent.setup() }
}

beforeEach(() => mockCanvas())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ConsentsPanel: lista', () => {
  it('muestra vigente/revocado con versión del texto y método; avisa si falta el general', async () => {
    setup({
      consents: [
        makeConsent({
          id: 'c-1',
          type: 'DATA_PROCESSING',
          text_version: 3,
          method: 'PAPER_SCANNED',
        }),
        makeConsent({
          id: 'c-2',
          type: 'GENERAL_CARE',
          is_valid: false,
          revoked_at: '2026-11-04T15:00:00Z',
          revoked_reason: 'El paciente lo pidió',
        }),
      ],
    })
    expect(await screen.findByText('Revocado')).toBeInTheDocument()
    expect(screen.getByText('Vigente')).toBeInTheDocument()
    expect(screen.getByText('v3')).toBeInTheDocument()
    expect(screen.getByText('Documento escaneado')).toBeInTheDocument()
    expect(screen.getByText('Motivo: El paciente lo pidió')).toBeInTheDocument()
    expect(screen.getByText('Sin consentimiento general vigente')).toBeInTheDocument()
  })

  it('con consentimiento general vigente no muestra el aviso', async () => {
    setup({ consents: [makeConsent()] })
    await screen.findByText('Vigente')
    expect(screen.queryByText('Sin consentimiento general vigente')).not.toBeInTheDocument()
  })

  it('recepción (sin acceso clínico) captura y revoca pero NO ve la firma', async () => {
    setup({ roles: ['RECEPTION'], canViewSignature: false, consents: [makeConsent()] })
    await screen.findByText('Vigente')
    expect(screen.getByRole('button', { name: /Revocar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar consentimiento' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ver firma/ })).not.toBeInTheDocument()
  })

  it('el clínico ve la firma como imagen (solo si es un PNG data URL)', async () => {
    const { user } = setup({
      consents: [makeConsent()],
      extra: [
        (c) =>
          c.url === '/api/consents/c-1/signature' ? jsonResponse(200, { image: PNG }) : undefined,
      ],
    })
    await user.click(await screen.findByRole('button', { name: /Ver firma/ }))
    const image = await screen.findByRole('img', { name: 'Firma manuscrita capturada en pantalla' })
    expect(image).toHaveAttribute('src', PNG)
  })

  it('una "firma" que no es PNG no se renderiza', async () => {
    const { user } = setup({
      consents: [makeConsent()],
      extra: [
        (c) =>
          c.url === '/api/consents/c-1/signature'
            ? jsonResponse(200, { image: 'javascript:alert(1)' })
            : undefined,
      ],
    })
    await user.click(await screen.findByRole('button', { name: /Ver firma/ }))
    expect(await screen.findByText(/no tiene un formato de imagen válido/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Firma manuscrita/ })).not.toBeInTheDocument()
  })
})

describe('ConsentsPanel: captura', () => {
  it('muestra la plantilla vigente TAL CUAL (incluida la leyenda de ejemplo) y firma en pantalla', async () => {
    const { calls, user } = setup({
      extra: [
        (c) =>
          c.method === 'POST' && c.url === '/api/patients/p-1/consents'
            ? jsonResponse(201, makeConsent())
            : undefined,
      ],
    })
    await user.click(await screen.findByRole('button', { name: 'Registrar consentimiento' }))
    const dialog = await screen.findByRole('dialog', { name: 'Registrar consentimiento' })
    // Solo la versión más alta de la plantilla; el texto no se altera.
    expect(
      await within(dialog).findByText(/EJEMPLO — NO CONSTITUYE UN TEXTO LEGAL VALIDADO/),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/versión 2/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Texto viejo/)).not.toBeInTheDocument()

    expect(within(dialog).getByLabelText(/Nombre de quien firma/)).toHaveValue('Rosa Quispe')
    sign()
    await user.click(within(dialog).getByRole('button', { name: 'Registrar consentimiento' }))

    expect(await screen.findByText('Consentimiento registrado.')).toBeInTheDocument()
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/patients/p-1/consents')
    expect(post?.body).toEqual({
      type: 'GENERAL_CARE',
      method: 'ON_SCREEN',
      signed_by_name: 'Rosa Quispe',
      signer_relation: null,
      witness_name: null,
      signature_image: PNG,
    })
  })

  it('sin firma en pantalla no envía y lo explica; con «Documento escaneado» no hace falta lienzo', async () => {
    const { calls, user } = setup({
      extra: [
        (c) =>
          c.method === 'POST' && c.url === '/api/patients/p-1/consents'
            ? jsonResponse(201, makeConsent({ method: 'PAPER_SCANNED' }))
            : undefined,
      ],
    })
    await user.click(await screen.findByRole('button', { name: 'Registrar consentimiento' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Registrar consentimiento' }))
    expect(await within(dialog).findByText('Falta la firma en pantalla')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.click(within(dialog).getByRole('radio', { name: 'Documento escaneado' }))
    expect(within(dialog).queryByRole('img', { name: /Área de firma/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Registrar consentimiento' }))
    expect(await screen.findByText('Consentimiento registrado.')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      method: 'PAPER_SCANNED',
      signature_image: null,
    })
  })

  it('en un menor firma el apoderado: se precarga y la relación es obligatoria', async () => {
    const { calls, user } = setup({ patient: MINOR })
    await user.click(await screen.findByRole('button', { name: 'Registrar consentimiento' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/menor de edad: firma su apoderado/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Nombre del apoderado que firma/)).toHaveValue(
      'Marta Quispe',
    )
    const relation = within(dialog).getByLabelText(/Relación con el paciente/)
    expect(relation).toHaveValue('Madre')

    await user.clear(relation)
    sign()
    await user.click(within(dialog).getByRole('button', { name: 'Registrar consentimiento' }))
    expect(
      await within(dialog).findByText(
        'El paciente es menor de edad: firma su apoderado (indique la relación)',
      ),
    ).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('muestra el mensaje del servidor si la regla se viola (verbal no vale para sueroterapia)', async () => {
    const { user } = setup({
      extra: [
        (c) =>
          c.method === 'POST' && c.url === '/api/patients/p-1/consents'
            ? jsonResponse(422, {
                error: {
                  code: 'consent_rule_violation',
                  message:
                    'Este procedimiento exige consentimiento escrito (firma en pantalla o documento)',
                },
              })
            : undefined,
      ],
    })
    await user.click(await screen.findByRole('button', { name: 'Registrar consentimiento' }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText(/Tipo de consentimiento/), 'IV_THERAPY')
    await user.click(within(dialog).getByRole('radio', { name: 'Verbal registrado' }))
    await user.click(within(dialog).getByRole('button', { name: 'Registrar consentimiento' }))
    expect(
      await within(dialog).findByText(/Este procedimiento exige consentimiento escrito/),
    ).toBeInTheDocument()
    // El diálogo sigue abierto para que se pueda corregir el método.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('ConsentsPanel: revocación', () => {
  it('exige motivo y revoca; luego informa', async () => {
    const { calls, user } = setup({
      consents: [makeConsent()],
      extra: [
        (c) =>
          c.method === 'POST' && c.url === '/api/consents/c-1/revoke'
            ? jsonResponse(
                200,
                makeConsent({
                  is_valid: false,
                  revoked_at: '2026-11-04T15:00:00Z',
                  revoked_reason: 'Cambió de opinión',
                }),
              )
            : undefined,
      ],
    })
    await user.click(await screen.findByRole('button', { name: /Revocar/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Revocar consentimiento' })
    await user.click(within(dialog).getByRole('button', { name: 'Revocar consentimiento' }))
    expect(
      await within(dialog).findByText('Indique el motivo de la revocación'),
    ).toBeInTheDocument()
    expect(calls.some((c) => c.url.endsWith('/revoke'))).toBe(false)

    await user.type(
      within(dialog).getByLabelText(/Motivo de la revocación/),
      '  Cambió de opinión ',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Revocar consentimiento' }))
    expect(await screen.findByText('Consentimiento revocado.')).toBeInTheDocument()
    expect(calls.find((c) => c.url.endsWith('/revoke'))?.body).toEqual({
      reason: 'Cambió de opinión',
    })
  })
})
