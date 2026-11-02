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

describe('can: pacientes y CRM', () => {
  it('lectura: personal clínico y administrativo; el paciente no', () => {
    for (const role of ['SUPERUSER', 'OWNER', 'DOCTOR', 'RECEPTION'] as const) {
      expect(can([role], 'patients:read')).toBe(true)
      expect(can([role], 'leads:read')).toBe(true)
    }
    expect(can(['PATIENT'], 'patients:read')).toBe(false)
    expect(can(['PATIENT'], 'leads:read')).toBe(false)
  })

  it('gestión: solo OWNER y RECEPTION (ni doctor ni superusuario)', () => {
    for (const permission of ['patients:manage', 'leads:manage'] as const) {
      expect(can(['OWNER'], permission)).toBe(true)
      expect(can(['RECEPTION'], permission)).toBe(true)
      expect(can(['DOCTOR'], permission)).toBe(false)
      expect(can(['SUPERUSER'], permission)).toBe(false)
      expect(can(['PATIENT'], permission)).toBe(false)
    }
  })

  it('estadísticas del CRM: solo OWNER', () => {
    expect(can(['OWNER'], 'leads:reports')).toBe(true)
    for (const role of ['SUPERUSER', 'DOCTOR', 'RECEPTION', 'PATIENT'] as const) {
      expect(can([role], 'leads:reports')).toBe(false)
    }
  })

  it('un dueño-doctor conserva los permisos de gestión por su rol OWNER', () => {
    expect(can(['DOCTOR', 'OWNER'], 'patients:manage')).toBe(true)
  })
})

describe('can: agenda', () => {
  it('lectura: personal clínico y administrativo; el paciente no', () => {
    for (const role of ['SUPERUSER', 'OWNER', 'DOCTOR', 'RECEPTION'] as const) {
      expect(can([role], 'agenda:read')).toBe(true)
    }
    expect(can(['PATIENT'], 'agenda:read')).toBe(false)
  })

  it('agendar y configurar horarios: solo OWNER y RECEPTION', () => {
    for (const permission of ['agenda:manage', 'schedule:manage'] as const) {
      expect(can(['OWNER'], permission)).toBe(true)
      expect(can(['RECEPTION'], permission)).toBe(true)
      expect(can(['DOCTOR'], permission)).toBe(false)
      expect(can(['SUPERUSER'], permission)).toBe(false)
      expect(can(['PATIENT'], permission)).toBe(false)
    }
  })

  it('atender (iniciar/completar): solo el rol DOCTOR; el dueño lo hace por su rol DOCTOR', () => {
    expect(can(['DOCTOR'], 'agenda:attend')).toBe(true)
    expect(can(['OWNER', 'DOCTOR'], 'agenda:attend')).toBe(true)
    for (const role of ['OWNER', 'RECEPTION', 'SUPERUSER', 'PATIENT'] as const) {
      expect(can([role], 'agenda:attend')).toBe(false)
    }
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
