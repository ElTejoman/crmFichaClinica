import { can, canAssignRole, canManageUser } from './permissions'

describe('can', () => {
  it('concede usuarios y auditoría a OWNER y SUPERUSER', () => {
    expect(can(['OWNER'], 'users:manage')).toBe(true)
    expect(can(['SUPERUSER'], 'audit:read')).toBe(true)
  })

  it('niega a recepción, paciente y doctor sin otro rol', () => {
    for (const role of ['RECEPTION', 'PATIENT', 'DOCTOR'] as const) {
      expect(can([role], 'users:manage')).toBe(false)
      expect(can([role], 'audit:read')).toBe(false)
    }
  })

  it('con múltiples roles basta uno que conceda (dueño = OWNER + DOCTOR)', () => {
    expect(can(['DOCTOR', 'OWNER'], 'audit:read')).toBe(true)
  })

  it('sin roles (sesión ausente) niega', () => {
    expect(can(undefined, 'users:manage')).toBe(false)
    expect(can([], 'users:manage')).toBe(false)
  })
})

describe('canAssignRole', () => {
  it('solo SUPERUSER asigna SUPERUSER u OWNER', () => {
    expect(canAssignRole(['OWNER'], 'OWNER')).toBe(false)
    expect(canAssignRole(['OWNER'], 'SUPERUSER')).toBe(false)
    expect(canAssignRole(['SUPERUSER'], 'OWNER')).toBe(true)
  })

  it('cualquier gestor puede asignar roles no privilegiados', () => {
    expect(canAssignRole(['OWNER'], 'RECEPTION')).toBe(true)
  })
})

describe('canManageUser', () => {
  const owner = { id: 'a', roles: ['OWNER' as const] }
  it('un OWNER no gestiona a otro OWNER, pero sí a sí mismo y a no privilegiados', () => {
    expect(canManageUser(owner, { id: 'b', roles: ['OWNER'] })).toBe(false)
    expect(canManageUser(owner, { id: 'a', roles: ['OWNER'] })).toBe(true)
    expect(canManageUser(owner, { id: 'c', roles: ['RECEPTION'] })).toBe(true)
  })
})
