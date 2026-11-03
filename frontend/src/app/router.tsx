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
            path: '/pacientes',
            lazy: async () => {
              const { PatientsPage } = await import('@/pages/PatientsPage')
              return {
                element: (
                  <RoleGuard permission="patients:read">
                    <PatientsPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/pacientes/nuevo',
            lazy: async () => {
              const { PatientNewPage } = await import('@/pages/PatientNewPage')
              return {
                element: (
                  <RoleGuard permission="patients:manage">
                    <PatientNewPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/pacientes/:patientId',
            lazy: async () => {
              const { PatientDetailPage } = await import('@/pages/PatientDetailPage')
              return {
                element: (
                  <RoleGuard permission="patients:read">
                    <PatientDetailPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/pacientes/:patientId/encuentros/:encounterId',
            lazy: async () => {
              const { EncounterPage } = await import('@/pages/EncounterPage')
              return {
                element: (
                  <RoleGuard permission="clinical:read">
                    <EncounterPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/leads',
            lazy: async () => {
              const { LeadsPage } = await import('@/pages/LeadsPage')
              return {
                element: (
                  <RoleGuard permission="leads:read">
                    <LeadsPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/leads/:leadId',
            lazy: async () => {
              const { LeadDetailPage } = await import('@/pages/LeadDetailPage')
              return {
                element: (
                  <RoleGuard permission="leads:read">
                    <LeadDetailPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/leads/:leadId/convertir',
            lazy: async () => {
              const { LeadConvertPage } = await import('@/pages/LeadConvertPage')
              // Convertir crea un paciente: exige gestionar leads Y pacientes.
              return {
                element: (
                  <RoleGuard permission="leads:manage">
                    <RoleGuard permission="patients:manage">
                      <LeadConvertPage />
                    </RoleGuard>
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/agenda',
            lazy: async () => {
              const { AgendaPage } = await import('@/pages/AgendaPage')
              return {
                element: (
                  <RoleGuard permission="agenda:read">
                    <AgendaPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/agenda/hoy',
            lazy: async () => {
              const { TodayPage } = await import('@/pages/TodayPage')
              return {
                element: (
                  <RoleGuard permission="agenda:manage">
                    <TodayPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/agenda/nueva',
            lazy: async () => {
              const { NewAppointmentPage } = await import('@/pages/NewAppointmentPage')
              return {
                element: (
                  <RoleGuard permission="agenda:manage">
                    <NewAppointmentPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/agenda/configuracion',
            lazy: async () => {
              const { AgendaConfigPage } = await import('@/pages/AgendaConfigPage')
              return {
                element: (
                  <RoleGuard permission="schedule:manage">
                    <AgendaConfigPage />
                  </RoleGuard>
                ),
              }
            },
          },
          {
            path: '/mi-agenda',
            lazy: async () => {
              const { MyAgendaPage } = await import('@/pages/MyAgendaPage')
              return {
                element: (
                  <RoleGuard permission="agenda:attend">
                    <MyAgendaPage />
                  </RoleGuard>
                ),
              }
            },
          },
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
