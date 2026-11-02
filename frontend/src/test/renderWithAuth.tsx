import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { AuthContext, type AuthContextValue } from '@/features/auth'
import type { Role, UserRead } from '@/shared/types/aliases'

export function makeUser(roles: Role[], overrides: Partial<UserRead> = {}): UserRead {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'ana@clinica-demo.pe',
    full_name: 'Ana Prueba',
    phone: null,
    is_active: true,
    roles,
    doctor_profile: null,
    ...overrides,
  }
}

/** Renderiza con un contexto de auth fijo (sin red) + router + QueryClient. */
export function renderWithAuth(ui: ReactElement, user: UserRead | null, route = '/') {
  const value: AuthContextValue = {
    user,
    status: user ? 'authenticated' : 'anonymous',
    notice: null,
    login: async () => undefined,
    logout: async () => undefined,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}
