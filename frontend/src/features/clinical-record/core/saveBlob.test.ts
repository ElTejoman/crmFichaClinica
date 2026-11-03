import { REVOKE_DELAY_MS, safeFilename, saveBlobAs } from './saveBlob'

describe('saveBlobAs', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('descarga mediante un enlace temporal y REVOCA la URL del Blob después', () => {
    const create = vi.fn(() => 'blob:abc')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    saveBlobAs(new Blob(['%PDF-']), 'informe.pdf')

    expect(create).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).not.toHaveBeenCalled() // aún no: el navegador puede estar leyendo la URL
    vi.advanceTimersByTime(REVOKE_DELAY_MS)
    expect(revoke).toHaveBeenCalledWith('blob:abc')
    // El enlace temporal no queda en el documento.
    expect(document.querySelector('a[download]')).toBeNull()
  })
})

describe('safeFilename', () => {
  it('sustituye separadores de ruta y caracteres de control; nunca queda vacío', () => {
    expect(safeFilename('../..\\etc:passwd')).toBe('.._.._etc_passwd')
    expect(safeFilename('a\nb')).toBe('a_b')
    expect(safeFilename('   ')).toBe('archivo')
  })
})
