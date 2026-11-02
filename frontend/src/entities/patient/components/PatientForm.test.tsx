import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { ApiError } from '@/shared/lib/http'

import { EMPTY_PATIENT_VALUES, type PatientFormValues } from '../schemas'
import { PatientForm } from './PatientForm'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(
  options: {
    onSubmit?: (values: PatientFormValues) => Promise<void>
    initialValues?: PatientFormValues
    mode?: 'create' | 'edit'
  } = {},
) {
  const onSubmit = vi.fn(options.onSubmit ?? (() => Promise.resolve()))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PatientForm
          mode={options.mode ?? 'create'}
          ariaLabel="Nuevo paciente"
          initialValues={options.initialValues ?? EMPTY_PATIENT_VALUES}
          submitLabel="Crear paciente"
          onSubmit={onSubmit}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onSubmit, user: userEvent.setup() }
}

async function fillAdult(user: ReturnType<typeof userEvent.setup>, birth = '1990-05-01') {
  await user.type(screen.getByLabelText(/N\.º de documento/), '90001234')
  await user.type(screen.getByLabelText(/Nombres/), 'Rosa')
  await user.type(screen.getByLabelText(/Apellidos/), 'Quispe')
  await user.type(screen.getByLabelText(/Fecha de nacimiento/), birth)
  await user.selectOptions(screen.getByLabelText(/Sexo/), 'FEMALE')
}

afterEach(() => vi.unstubAllGlobals())

describe('PatientForm (alta)', () => {
  it('rechaza un DNI inválido y no envía', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, [])))
    const { user, onSubmit } = setup()
    await fillAdult(user)
    await user.clear(screen.getByLabelText(/N\.º de documento/))
    await user.type(screen.getByLabelText(/N\.º de documento/), '1234')
    await user.click(screen.getByRole('checkbox', { name: /autoriza el tratamiento/ }))
    await user.click(screen.getByRole('button', { name: 'Crear paciente' }))

    expect(await screen.findByText('El DNI debe tener exactamente 8 dígitos')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('el consentimiento de datos es obligatorio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, [])))
    const { user, onSubmit } = setup()
    await fillAdult(user)
    await user.click(screen.getByRole('button', { name: 'Crear paciente' }))

    expect(await screen.findByText(/^Debe confirmar que el paciente autoriza/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('un adulto no ve la sección de apoderado y se envía correctamente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, [])))
    const { user, onSubmit } = setup()
    await fillAdult(user)
    expect(screen.queryByText('Apoderado')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /autoriza el tratamiento/ }))
    await user.click(screen.getByRole('button', { name: 'Crear paciente' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        document_number: '90001234',
        first_name: 'Rosa',
        data_processing_consent: true,
      }),
    )
  })

  it('para un menor aparece el apoderado y es obligatorio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, [])))
    const { user, onSubmit } = setup()
    const year = new Date().getFullYear() - 10
    await fillAdult(user, `${year}-01-01`)
    expect(await screen.findByText(/menor de 18 años/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Nombre del apoderado/)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /autoriza el tratamiento/ }))
    await user.click(screen.getByRole('button', { name: 'Crear paciente' }))

    expect(await screen.findByText('Ingrese el nombre del apoderado')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/Nombre del apoderado/), 'Luz Quispe')
    const guardianSection = within(screen.getByRole('group', { name: 'Apoderado' }))
    await user.type(guardianSection.getByLabelText(/^Parentesco/), 'Madre')
    await user.type(screen.getByLabelText(/N\.º de documento del apoderado/), '40123456')
    await user.type(screen.getByLabelText(/Teléfono del apoderado/), '912345678')
    await user.click(screen.getByRole('button', { name: 'Crear paciente' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      guardian: { name: 'Luz Quispe', document_number: '40123456', relation: 'Madre' },
    })
  })

  it('avisa de posibles duplicados con enlace al paciente, sin bloquear', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/patients/duplicates')) {
        return Promise.resolve(
          json(200, [
            {
              patient_id: 'p-77',
              full_name: 'Rosa Quispe Mamani',
              birth_date: '1990-05-01',
              document_type: 'DNI',
              document_number_masked: '*****234',
              name_similarity: 0.9,
              reasons: ['Mismo nombre aproximado y misma fecha de nacimiento'],
            },
          ]),
        )
      }
      return Promise.resolve(json(200, []))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { user } = setup()
    await user.type(screen.getByLabelText(/Nombres/), 'Rosa')
    await user.type(screen.getByLabelText(/Apellidos/), 'Quispe')
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-05-01')

    expect(await screen.findByText('Posibles pacientes ya registrados')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Rosa Quispe Mamani' })
    expect(link).toHaveAttribute('href', '/pacientes/p-77')
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/patients/duplicates'))
    expect(String(call?.[0])).toContain('first_name=Rosa')
    expect(String(call?.[0])).toContain('birth_date=1990-05-01')
    expect(screen.getByRole('button', { name: 'Crear paciente' })).toBeEnabled()
  })

  it('muestra el 409 de documento repetido junto al campo y enlaza al existente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, [])))
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(409, 'conflict', 'Ya existe un paciente con ese documento', {
        details: { code: 'patient_document_exists', patient_id: 'p-9', full_name: 'Rosa Quispe' },
      }),
    )
    const { user } = setup({ onSubmit })
    await fillAdult(user)
    await user.click(screen.getByRole('checkbox', { name: /autoriza el tratamiento/ }))
    await user.click(screen.getByRole('button', { name: 'Crear paciente' }))

    expect(await screen.findAllByText('Ya existe un paciente con ese documento')).not.toHaveLength(
      0,
    )
    expect(screen.getByRole('link', { name: 'Rosa Quispe' })).toHaveAttribute(
      'href',
      '/pacientes/p-9',
    )
  })
})

describe('PatientForm (edición)', () => {
  it('el documento no es editable y no se pide consentimiento', () => {
    setup({
      mode: 'edit',
      initialValues: { ...EMPTY_PATIENT_VALUES, document_number: '90001234', first_name: 'Rosa' },
    })
    expect(screen.getByLabelText(/N\.º de documento/)).toBeDisabled()
    expect(
      screen.queryByRole('checkbox', { name: /autoriza el tratamiento/ }),
    ).not.toBeInTheDocument()
  })
})
