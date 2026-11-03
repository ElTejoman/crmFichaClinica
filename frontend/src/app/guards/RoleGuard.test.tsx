import { screen } from '@testing-library/react'

import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { RoleGuard } from './RoleGuard'

const secret = <RoleGuard permission="users:manage">Panel de usuarios</RoleGuard>

describe('RoleGuard', () => {
  it('muestra el contenido a quien tiene el permiso', () => {
    renderWithAuth(secret, makeUser(['OWNER']))
    expect(screen.getByText('Panel de usuarios')).toBeInTheDocument()
  })

  it('muestra 403 a quien no lo tiene', () => {
    renderWithAuth(secret, makeUser(['RECEPTION']))
    expect(screen.queryByText('Panel de usuarios')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
  })

  it('un usuario con varios roles pasa si alguno concede el permiso', () => {
    renderWithAuth(secret, makeUser(['DOCTOR', 'OWNER']))
    expect(screen.getByText('Panel de usuarios')).toBeInTheDocument()
  })
})

describe('RoleGuard: contenido clínico', () => {
  const clinical = <RoleGuard permission="clinical:read">Encuentro clínico</RoleGuard>

  it('doctor y dueño entran; recepción y superusuario ven 403 (nunca el contenido clínico)', () => {
    const { unmount } = renderWithAuth(clinical, makeUser(['DOCTOR']))
    expect(screen.getByText('Encuentro clínico')).toBeInTheDocument()
    unmount()
    for (const role of ['RECEPTION', 'SUPERUSER', 'PATIENT'] as const) {
      const view = renderWithAuth(clinical, makeUser([role]))
      expect(screen.queryByText('Encuentro clínico')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
      view.unmount()
    }
    renderWithAuth(clinical, makeUser(['OWNER']))
    expect(screen.getByText('Encuentro clínico')).toBeInTheDocument()
  })
})
