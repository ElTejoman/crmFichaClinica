import type { ComponentProps } from 'react'

import { controlClass } from './controlClass'

/** React 19: `ref` llega como prop normal, por eso funciona directo con `register` de RHF. */
export function Input({ className = '', ...rest }: ComponentProps<'input'>) {
  return (
    <input
      className={`${controlClass(rest['aria-invalid'] === true || rest['aria-invalid'] === 'true')} ${className}`}
      {...rest}
    />
  )
}

export function Select({ className = '', children, ...rest }: ComponentProps<'select'>) {
  return (
    <select
      className={`${controlClass(rest['aria-invalid'] === true || rest['aria-invalid'] === 'true')} ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
}
