import type { ComponentProps } from 'react'

import { FOCUS_RING } from './focus'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-600 disabled:hover:bg-brand-700',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost: 'text-brand-700 hover:bg-brand-50',
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant
  /** Muestra spinner y deshabilita: evita doble envío mientras se guarda. */
  loading?: boolean
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
