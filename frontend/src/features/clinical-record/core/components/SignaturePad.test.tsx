import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SignaturePad } from './SignaturePad'

const PNG = 'data:image/png;base64,AAAA'

function mockCanvas() {
  const context = {
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG)
  return { context, toDataURL }
}

afterEach(() => vi.restoreAllMocks())

describe('SignaturePad', () => {
  it('dibujar con el puntero exporta un PNG data URL al soltar', () => {
    const { context, toDataURL } = mockCanvas()
    const onChange = vi.fn()
    render(<SignaturePad value="" onChange={onChange} />)
    const canvas = screen.getByRole('img', { name: /Área de firma/ })

    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled() // todavía se está firmando
    fireEvent.pointerUp(canvas, { pointerId: 1 })

    expect(context.moveTo).toHaveBeenCalled()
    expect(context.lineTo).toHaveBeenCalledTimes(2) // el punto inicial + el trazo
    expect(toDataURL).toHaveBeenCalledWith('image/png')
    expect(onChange).toHaveBeenCalledWith(PNG)
  })

  it('mover el puntero sin haber presionado no dibuja ni exporta', () => {
    const { context } = mockCanvas()
    const onChange = vi.fn()
    render(<SignaturePad value="" onChange={onChange} />)
    const canvas = screen.getByRole('img', { name: /Área de firma/ })
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30 })
    fireEvent.pointerUp(canvas)
    expect(context.lineTo).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('«Borrar firma» limpia el lienzo y avisa con cadena vacía; deshabilitado sin firma', async () => {
    const { context } = mockCanvas()
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<SignaturePad value="" onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Borrar firma' })).toBeDisabled()
    expect(screen.getByText('Sin firma')).toBeInTheDocument()

    rerender(<SignaturePad value={PNG} onChange={onChange} />)
    expect(screen.getByText(/Firma capturada/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Borrar firma' }))
    expect(context.clearRect).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('declara la alternativa no gráfica en su nombre accesible', () => {
    mockCanvas()
    render(<SignaturePad value="" onChange={() => undefined} />)
    expect(
      screen.getByRole('img', { name: /Documento escaneado.*Verbal registrado/ }),
    ).toBeInTheDocument()
  })

  it('si el navegador no ofrece contexto 2D, explica que se use otro método', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<SignaturePad value="" onChange={() => undefined} />)
    expect(screen.getByText(/no permite firmar en pantalla/)).toBeInTheDocument()
  })
})
