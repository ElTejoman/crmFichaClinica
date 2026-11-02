import { createBrowserRouter } from 'react-router-dom'

import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

import { AppLayout } from './AppLayout'
import { RequireAuth } from './guards/RequireAuth'
import { RoleGuard } from './guards/RoleGuard'

// Las pantallas de administración se cargan bajo demanda: no pesan en el login ni para recepción.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          {
            path: '/usuarios',
            lazy: async () => {
              const { UsersPage } = await import('@/pages/UsersPage')
              return {
                element: (
                  <RoleGuard permission="users:manage">
                    <UsersPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/auditoria',
            lazy: async () => {
              const { AuditPage } = await import('@/pages/AuditPage')
              return {
                element: (
                  <RoleGuard permission="audit:read">
                    <AuditPage />
                  </RoleGuard>
                ),
              }
            },
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
