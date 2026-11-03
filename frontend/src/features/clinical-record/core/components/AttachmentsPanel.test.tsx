import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { makeAttachment } from '@/test/clinical'
import { installFetch, jsonResponse, type RecordedCall } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { MAX_ATTACHMENT_BYTES } from '../attachments'
import { REVOKE_DELAY_MS } from '../saveBlob'
import { AttachmentsPanel } from './AttachmentsPanel'

function fileOf(size: number, type: string, name: string): File {
  return new File([new Uint8Array(size)], name, { type })
}

function setup(options: {
  canUpload?: boolean
  extra?: ((c: RecordedCall) => Response | undefined)[]
  attachments?: ReturnType<typeof makeAttachment>[]
}) {
  const calls = installFetch(...(options.extra ?? []), (c) =>
    c.method === 'GET' && c.url === '/api/patients/p-1/attachments'
      ? jsonResponse(200, options.attachments ?? [])
      : undefined,
  )
  renderWithAuth(
    <AttachmentsPanel patientId="p-1" canUpload={options.canUpload ?? true} />,
    makeUser(['DOCTOR']),
  )
  return { calls, user: userEvent.setup({ applyAccept: false }) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AttachmentsPanel: lista', () => {
  it('lista tipo, tamaño y consentimiento; el nombre del archivo se muestra solo como texto', async () => {
    const hostile = '<img src=x onerror=alert(1)>.pdf'
    setup({ attachments: [makeAttachment({ original_name: hostile })] })
    expect(await screen.findByText(hostile)).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    const table = within(screen.getByRole('table', { name: 'Archivos adjuntos del paciente' }))
    expect(table.getByText('Laboratorio')).toBeInTheDocument()
    expect(table.getByText('2 KB')).toBeInTheDocument()
    expect(table.getByText('Con consentimiento')).toBeInTheDocument()
  })

  it('sin permiso de escritura no hay formulario de subida', async () => {
    setup({ canUpload: false })
    await screen.findByText('Aún no hay archivos adjuntos.')
    expect(screen.queryByRole('form', { name: 'Subir adjunto' })).not.toBeInTheDocument()
  })
})

describe('AttachmentsPanel: subida', () => {
  it('rechaza en el cliente un archivo de más de 10 MB sin llamar al servidor', async () => {
    const { calls, user } = setup({})
    await user.upload(
      await screen.findByLabelText(/Archivo/),
      fileOf(MAX_ATTACHMENT_BYTES + 1, 'application/pdf', 'enorme.pdf'),
    )
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }))
    expect(await screen.findByText(/el máximo es 10,0 MB/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('rechaza tipos no admitidos', async () => {
    const { calls, user } = setup({})
    await user.upload(
      await screen.findByLabelText(/Archivo/),
      fileOf(10, 'application/zip', 'a.zip'),
    )
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }))
    expect(
      await screen.findByText('Solo se admiten archivos PDF, PNG, JPEG o WEBP'),
    ).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('sin elegir archivo pide elegirlo', async () => {
    const { user } = setup({})
    await user.click(await screen.findByRole('button', { name: 'Subir archivo' }))
    expect(await screen.findByText('Elija un archivo')).toBeInTheDocument()
  })

  it('las fotos piden marcar el consentimiento del paciente', async () => {
    const { calls, user } = setup({})
    await user.upload(await screen.findByLabelText(/Archivo/), fileOf(10, 'image/jpeg', 'foto.jpg'))
    await user.selectOptions(screen.getByLabelText(/Tipo/), 'PHOTO')
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }))
    expect(
      await screen.findByText('Las fotografías exigen que el paciente haya dado su consentimiento'),
    ).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('sube el archivo como multipart con tipo y consentimiento', async () => {
    const { calls, user } = setup({
      extra: [
        (c) =>
          c.method === 'POST' && c.url === '/api/patients/p-1/attachments'
            ? jsonResponse(201, makeAttachment({ kind: 'PHOTO' }))
            : undefined,
      ],
    })
    await user.upload(await screen.findByLabelText(/Archivo/), fileOf(10, 'image/jpeg', 'foto.jpg'))
    await user.selectOptions(screen.getByLabelText(/Tipo/), 'PHOTO')
    await user.click(screen.getByLabelText(/consentimiento para esta fotografía/))
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }))

    expect(await screen.findByText('Archivo subido.')).toBeInTheDocument()
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.formData?.get('kind')).toBe('PHOTO')
    expect(post?.formData?.get('has_patient_consent')).toBe('true')
    expect(post?.formData?.get('file')).toBeInstanceOf(File)
  })

  it('muestra el rechazo del servidor (attachment_rejected)', async () => {
    const { user } = setup({
      extra: [
        (c) =>
          c.method === 'POST'
            ? jsonResponse(422, {
                error: {
                  code: 'attachment_rejected',
                  message: 'El contenido del archivo no corresponde a su tipo',
                },
              })
            : undefined,
      ],
    })
    await user.upload(
      await screen.findByLabelText(/Archivo/),
      fileOf(10, 'application/pdf', 'x.pdf'),
    )
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }))
    expect(
      await screen.findByText('El contenido del archivo no corresponde a su tipo'),
    ).toBeInTheDocument()
  })
})

describe('AttachmentsPanel: descarga', () => {
  function stubUrls() {
    const create = vi.fn(() => 'blob:temporal')
    const revoke = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      value: create,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revoke,
      configurable: true,
      writable: true,
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    return { create, revoke, click }
  }

  it('descarga con fetch autenticado -> Blob -> enlace temporal que se REVOCA después', async () => {
    const { create, revoke, click } = stubUrls()
    const { calls, user } = setup({
      attachments: [makeAttachment()],
      extra: [
        (c) =>
          c.url === '/api/attachments/att-1/download'
            ? new Response('%PDF-1.4', {
                status: 200,
                headers: { 'Content-Type': 'application/pdf' },
              })
            : undefined,
      ],
    })
    await user.click(await screen.findByRole('button', { name: 'Descargar: hemograma.pdf' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledTimes(1)
    expect(calls.some((c) => c.url === '/api/attachments/att-1/download')).toBe(true)
    // El contenido nunca se pinta en la página: no hay iframe, embed, object ni img.
    expect(document.querySelector('iframe, embed, object, img')).toBeNull()
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:temporal'), {
      timeout: REVOKE_DELAY_MS + 1000,
    })
  })

  it('si el archivo falta en el almacenamiento muestra el mensaje controlado', async () => {
    stubUrls()
    const { user } = setup({
      attachments: [makeAttachment()],
      extra: [
        (c) =>
          c.url === '/api/attachments/att-1/download'
            ? jsonResponse(404, {
                error: {
                  code: 'attachment_file_missing',
                  message: 'El archivo no está disponible',
                },
              })
            : undefined,
      ],
    })
    await user.click(await screen.findByRole('button', { name: /Descargar/ }))
    expect(await screen.findByText('El archivo no está disponible')).toBeInTheDocument()
  })
})
