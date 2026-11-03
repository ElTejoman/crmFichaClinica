import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { Icd10Combobox } from './Icd10Combobox'

afterEach(() => vi.unstubAllGlobals())

const CATALOG = [
  { code: 'M54.5', description: 'Lumbalgia baja' },
  { code: 'M54.4', description: 'Lumbago con ciática' },
]

function setup() {
  const onSelect = vi.fn()
  const calls = installFetch((c) => {
    if (!c.url.startsWith('/api/icd10?')) return undefined
    const q = new URLSearchParams(c.url.split('?')[1]).get('q') ?? ''
    return jsonResponse(200, q.toLowerCase().startsWith('lumb') ? CATALOG : [])
  })
  renderWithAuth(<Icd10Combobox onSelect={onSelect} />, makeUser(['DOCTOR']))
  return { onSelect, calls, user: userEvent.setup() }
}

describe('Icd10Combobox', () => {
  it('expone el patrón combobox accesible (rol, etiqueta, aria-expanded/controls)', () => {
    setup()
    const input = screen.getByRole('combobox', { name: 'Buscar diagnóstico CIE-10' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input.getAttribute('aria-controls')).toBeTruthy()
  })

  it('busca con debounce: escribir rápido hace UNA petición, y la lista se anuncia', async () => {
    const { calls, user } = setup()
    await user.type(screen.getByRole('combobox'), 'lumb')
    expect(
      await screen.findByRole('option', { name: /M54.5 — Lumbalgia baja/ }),
    ).toBeInTheDocument()
    const searches = calls.filter((c) => c.url.startsWith('/api/icd10?'))
    expect(searches).toHaveLength(1)
    expect(new URLSearchParams(searches[0]?.url.split('?')[1]).get('q')).toBe('lumb')
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText(/2 resultados/)).toBeInTheDocument()
  })

  it('se maneja con teclado: flechas mueven aria-activedescendant y Enter elige', async () => {
    const { onSelect, user } = setup()
    const input = screen.getByRole('combobox')
    await user.type(input, 'lumb')
    await screen.findAllByRole('option')

    await user.keyboard('{ArrowDown}')
    const first = screen.getAllByRole('option')[0]
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', first?.id)

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith({
      code: 'M54.4',
      description: 'Lumbago con ciática',
      fromCatalog: true,
    })
    // Tras elegir se limpia el campo y se cierra la lista.
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('Escape cierra la lista sin elegir; el clic con el mouse también elige', async () => {
    const { onSelect, user } = setup()
    const input = screen.getByRole('combobox')
    await user.type(input, 'lumb')
    await screen.findAllByRole('option')
    await user.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(onSelect).not.toHaveBeenCalled()

    await user.type(input, 'a')
    await user.click(await screen.findByRole('option', { name: /M54.5/ }))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'M54.5', fromCatalog: true }),
    )
  })

  it('un código válido que no está en el catálogo se ofrece como descripción manual', async () => {
    const { onSelect, user } = setup()
    await user.type(screen.getByRole('combobox'), 'k021')
    const manual = await screen.findByRole('option', { name: /Usar el código K02\.1/ })
    await user.click(manual)
    expect(onSelect).toHaveBeenCalledWith({ code: 'K02.1', description: '', fromCatalog: false })
  })

  it('sin resultados ni código válido avisa en una región aria-live', async () => {
    const { user } = setup()
    await user.type(screen.getByRole('combobox'), 'zzzz')
    await waitFor(() =>
      expect(screen.getByText(/Sin resultados en el catálogo/)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('Enter nunca envía el formulario que lo contiene', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    installFetch(() => jsonResponse(200, []))
    const user = userEvent.setup()
    renderWithAuth(
      <form onSubmit={onSubmit}>
        <Icd10Combobox onSelect={() => undefined} />
      </form>,
      makeUser(['DOCTOR']),
    )
    await user.type(screen.getByRole('combobox'), 'abc{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
