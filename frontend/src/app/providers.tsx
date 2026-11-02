import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { AuthProvider } from '@/features/auth'
import { ApiError } from '@/shared/lib/http'

const HTTP_CLIENT_ERROR_MIN = 400
const HTTP_SERVER_ERROR_MIN = 500
const MAX_RETRIES = 2

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // No se reintentan errores 4xx (permisos, validación): no cambiarán por insistir.
      retry: (failureCount, error) =>
        !(
          error instanceof ApiError &&
          error.status >= HTTP_CLIENT_ERROR_MIN &&
          error.status < HTTP_SERVER_ERROR_MIN
        ) && failureCount < MAX_RETRIES,
    },
  },
})

/** AuthProvider va dentro de Query: al cerrar sesión limpia la caché de datos. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
