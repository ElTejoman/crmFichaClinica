import type { ComponentProps, ReactNode } from 'react'

/** Tabla simple con scroll horizontal en pantallas estrechas; `caption` es obligatorio (a11y). */
export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
      <table className="w-full min-w-max text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export function Th({ className = '', ...rest }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={`bg-slate-100 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-700 uppercase ${className}`}
      {...rest}
    />
  )
}

export function Td({ className = '', ...rest }: ComponentProps<'td'>) {
  return <td className={`border-t border-slate-200 px-4 py-3 align-top ${className}`} {...rest} />
}
