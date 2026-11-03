import { useEffect, useRef, useState, type PointerEvent } from 'react'

import { Button } from '@/shared/ui'

/** Resolución fija del lienzo: mantiene el PNG pequeño (el servidor admite hasta ~400 KB). */
export const SIGNATURE_WIDTH = 600
export const SIGNATURE_HEIGHT = 200
const STROKE_WIDTH = 2.5
const STROKE_COLOR = '#0f172a'

interface SignaturePadProps {
  /** PNG en data URL (vacío = sin firma). */
  value: string
  onChange: (dataUrl: string) => void
  invalid?: boolean
  describedBy?: string
}

/**
 * Firma manuscrita en pantalla (mouse, dedo o lápiz óptico vía Pointer Events). Exporta un PNG
 * data URL solo cuando hay trazo. El teclado no puede dibujar: la alternativa NO gráfica son los
 * otros métodos de consentimiento («Documento escaneado» y «Verbal registrado»), que el formulario
 * ofrece junto al lienzo.
 */
export function SignaturePad({ value, onChange, invalid = false, describedBy }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null
    if (!context) {
      setSupported(false)
      return
    }
    context.lineWidth = STROKE_WIDTH
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = STROKE_COLOR
  }, [])

  function pointOf(event: PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY }
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    drawingRef.current = true
    canvas.setPointerCapture?.(event.pointerId)
    const { x, y } = pointOf(event, canvas)
    context.beginPath()
    context.moveTo(x, y)
    // Un toque sin movimiento deja un punto (cap redondeado).
    context.lineTo(x, y)
    context.stroke()
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const { x, y } = pointOf(event, canvas)
    context.lineTo(x, y)
    context.stroke()
  }

  function end() {
    if (!drawingRef.current) return
    drawingRef.current = false
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    onChange('')
  }

  if (!supported) {
    return (
      <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
        Este navegador no permite firmar en pantalla. Elija otro método de consentimiento.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={SIGNATURE_WIDTH}
        height={SIGNATURE_HEIGHT}
        role="img"
        aria-label="Área de firma. Dibuje con el mouse, el dedo o un lápiz óptico. Si no puede dibujar, elija «Documento escaneado» o «Verbal registrado» como método."
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        // `touch-action: none` evita que el dedo desplace la página en vez de dibujar.
        className={`h-40 w-full max-w-xl cursor-crosshair touch-none rounded-md border-2 bg-white ${
          invalid ? 'border-red-700' : 'border-slate-400'
        }`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={clear} disabled={value === ''}>
          Borrar firma
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-slate-700">
          {value === '' ? 'Sin firma' : '✓ Firma capturada'}
        </p>
      </div>
    </div>
  )
}
