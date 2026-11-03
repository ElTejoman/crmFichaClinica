import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DOCTOR_ID, makeEncounter, makeSignedEncounter } from '@/test/clinical'
import { installClinicalApi } from '@/test/clinicalApi'
import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'
import type { Role } from '@/shared/types/aliases'

import { EncounterWorkspace } from './EncounterWorkspace'

afterEach(() => vi.unstubAllGlobals())

function renderAs(roles: Role[], userId = DOCTOR_ID) {
  const user = makeUser(roles, { id: userId })
  return renderWithAuth(
    <EncounterWorkspace
      patientId="p-1"
      encounterId="e-1"
      viewer={{ id: user.id, roles: user.roles }}
    />,
    user,
  )
}

describe('encuentro firmado: vista de solo lectura', () => {
  it('muestra firmante, colegiatura y fecha de Lima, sin ningún campo editable', async () => {
    installClinicalApi({ encounter: makeSignedEncounter() })
    renderAs(['DOCTOR'])
    const firma = await screen.findByRole('region', { name: 'Firma del encuentro' })
    expect(within(firma).getByText('Ana Torres · CMP 12345')).toBeInTheDocument()
    // 3-nov-2026 15:30Z = 10:30 en Lima, sin importar la zona del equipo que corre la prueba.
    expect(firma).toHaveTextContent(/3\/11\/26.*10:30/)
    expect(screen.getByText('Dolor lumbar de 3 semanas')).toBeInTheDocument()
    expect(screen.getByText(/M54\.5/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Editor del encuentro' })).not.toBeInTheDocument()
    expect(screen.getByText(/Encuentro firmado: es de solo lectura/)).toBeInTheDocument()
  })

  it('un borrador NUNCA se muestra editable si ya no lo es (estado enmendado = solo lectura)', async () => {
    installClinicalApi({
      encounter: makeSignedEncounter({
        status: 'AMENDED',
        addenda: [
          {
            id: 'ad-1',
            reason: 'Corrección de dosis',
            text: 'Se aclara la dosis indicada.',
            author_name: 'Ana Torres',
            author_license: 'CMP 12345',
            created_at: '2026-11-04T15:00:00Z',
          },
        ],
      }),
    })
    renderAs(['DOCTOR'])
    expect(await screen.findByText('Corrección de dosis')).toBeInTheDocument()
    expect(screen.getByText('Se aclara la dosis indicada.')).toBeInTheDocument()
    expect(screen.getAllByText('Enmendado').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('solo el autor ve el botón Adenda; el dueño u otro doctor ven solo lectura', async () => {
    installClinicalApi({ encounter: makeSignedEncounter() })
    const { unmount } = renderAs(['DOCTOR'])
    expect(await screen.findByRole('button', { name: 'Adenda' })).toBeInTheDocument()
    unmount()

    renderAs(['OWNER'], 'owner-1')
    expect(await screen.findByText('Firmado electrónicamente')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adenda' })).not.toBeInTheDocument()
    expect(screen.getByText(/Solo el autor puede añadir adendas/)).toBeInTheDocument()
  })

  it('un dueño-doctor que NO es el autor tampoco añade adendas', async () => {
    installClinicalApi({ encounter: makeSignedEncounter() })
    renderAs(['OWNER', 'DOCTOR'], 'otro-doctor')
    expect(await screen.findByText('Firmado electrónicamente')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adenda' })).not.toBeInTheDocument()
  })

  it('Adenda exige motivo y texto, y al guardar aparece en la lista', async () => {
    const enmendado = makeSignedEncounter({
      status: 'AMENDED',
      addenda: [
        {
          id: 'ad-1',
          reason: 'Aclaración',
          text: 'Texto nuevo de la adenda',
          author_name: 'Ana Torres',
          author_license: 'CMP 12345',
          created_at: '2026-11-04T15:00:00Z',
        },
      ],
    })
    const api = installClinicalApi({
      encounter: makeSignedEncounter(),
      extra: [
        (c) =>
          c.method === 'POST' && c.url === '/api/encounters/e-1/addenda'
            ? jsonResponse(201, enmendado)
            : undefined,
      ],
    })
    const user = userEvent.setup()
    renderAs(['DOCTOR'])
    await user.click(await screen.findByRole('button', { name: 'Adenda' }))
    const dialog = await screen.findByRole('dialog', { name: 'Agregar adenda' })

    await user.click(within(dialog).getByRole('button', { name: 'Guardar adenda' }))
    expect(await within(dialog).findByText('Indique el motivo de la adenda')).toBeInTheDocument()
    expect(within(dialog).getByText('Escriba el texto de la adenda')).toBeInTheDocument()
    expect(api.calls.some((c) => c.url.endsWith('/addenda'))).toBe(false)

    await user.type(within(dialog).getByLabelText(/Motivo de la adenda/), 'Aclaración')
    await user.type(within(dialog).getByLabelText(/Texto de la adenda/), 'Texto nuevo de la adenda')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar adenda' }))

    expect(await screen.findByText('Adenda registrada.')).toBeInTheDocument()
    expect(api.calls.find((c) => c.url.endsWith('/addenda'))?.body).toEqual({
      reason: 'Aclaración',
      text: 'Texto nuevo de la adenda',
    })
    expect(screen.getByText('Texto nuevo de la adenda')).toBeInTheDocument()
  })

  it('«Verificar integridad» muestra un resultado claro: íntegro o ALTERADO', async () => {
    let valid = true
    installClinicalApi({
      encounter: makeSignedEncounter(),
      extra: [
        (c) =>
          c.url === '/api/encounters/e-1/integrity'
            ? jsonResponse(200, { valid, signed_at: '2026-11-03T15:30:00Z', algorithm: 'SHA-256' })
            : undefined,
      ],
    })
    const user = userEvent.setup()
    renderAs(['DOCTOR'])
    await user.click(await screen.findByRole('button', { name: 'Verificar integridad' }))
    expect(await screen.findByText('Contenido íntegro')).toBeInTheDocument()
    expect(screen.getByText(/no es una firma digital con valor legal/)).toBeInTheDocument()

    valid = false
    await user.click(screen.getByRole('button', { name: 'Verificar integridad' }))
    expect(await screen.findByText('Contenido ALTERADO')).toBeInTheDocument()
    expect(screen.queryByText('Contenido íntegro')).not.toBeInTheDocument()
  })

  it('Imprimir abre el diálogo de impresión del navegador', async () => {
    installClinicalApi({ encounter: makeSignedEncounter() })
    const print = vi.fn()
    vi.stubGlobal('print', print)
    const user = userEvent.setup()
    renderAs(['DOCTOR'])
    await user.click(await screen.findByRole('button', { name: 'Imprimir' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('el encabezado de impresión lleva la clínica genérica, el paciente y el firmante', async () => {
    installClinicalApi({ encounter: makeSignedEncounter() })
    const { container } = renderAs(['DOCTOR'])
    await screen.findByText('Firmado electrónicamente')
    const header = container.querySelector('.print-only')
    expect(header).toHaveTextContent('Clínica · Historia clínica')
    expect(header).toHaveTextContent('Paciente: Rosa Quispe')
    expect(header).toHaveTextContent('Firmante: Ana Torres')
    // Los menús y botones quedan fuera de la hoja.
    expect(container.querySelectorAll('[data-no-print]').length).toBeGreaterThan(0)
  })
})

describe('encuentro: accesos y errores', () => {
  it('un borrador ajeno (otro autor) se ve en solo lectura, sin editor', async () => {
    installClinicalApi({ encounter: makeEncounter({ doctor_user_id: 'otro' }) })
    renderAs(['DOCTOR'])
    expect(await screen.findByText(/Este encuentro es un borrador/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Editor del encuentro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('el dueño sin rol de doctor no obtiene editor aunque el borrador fuera suyo', async () => {
    installClinicalApi({ encounter: makeEncounter({ doctor_user_id: 'owner-1' }) })
    renderAs(['OWNER'], 'owner-1')
    expect(await screen.findByText(/Este encuentro es un borrador/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('un 403 se muestra como mensaje claro con enlace de regreso, no como pantalla rota', async () => {
    installFetch((c) =>
      c.url.startsWith('/api/encounters/')
        ? jsonResponse(403, {
            error: {
              code: 'permission_denied',
              message: 'No tienes acceso al contenido clínico de este paciente',
            },
          })
        : undefined,
    )
    renderAs(['DOCTOR'])
    expect(await screen.findByText(/No tiene acceso a este contenido clínico/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a la historia clínica' })).toHaveAttribute(
      'href',
      '/pacientes/p-1?tab=historia',
    )
  })

  it('si la URL mezcla un paciente con un encuentro de otro, no muestra el contenido', async () => {
    installClinicalApi({
      encounter: makeSignedEncounter({ patient_id: 'p-OTRO' }),
      extra: [
        (c) =>
          c.url === '/api/encounters/e-1'
            ? jsonResponse(200, makeSignedEncounter({ patient_id: 'p-OTRO' }))
            : undefined,
      ],
    })
    renderAs(['DOCTOR'])
    expect(await screen.findByText(/no pertenece al paciente indicado/)).toBeInTheDocument()
    expect(screen.queryByText('Dolor lumbar de 3 semanas')).not.toBeInTheDocument()
  })
})
