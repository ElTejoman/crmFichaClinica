import type { ComponentProps } from 'react'

import { controlClass } from './controlClass'

export function Textarea({ className = '', ...rest }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={3}
      className={`${controlClass(rest['aria-invalid'] === true || rest['aria-invalid'] === 'true')} ${className}`}
      {...rest}
    />
  )
}
