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
