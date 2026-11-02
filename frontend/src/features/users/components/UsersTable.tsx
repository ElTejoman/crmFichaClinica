import { canManageUser } from '@/entities/user'
import { roleLabel } from '@/shared/lib/labels'
import type { UserRead } from '@/shared/types/aliases'
import { Badge, Button, Table, Td, Th } from '@/shared/ui'

interface UsersTableProps {
  users: readonly UserRead[]
  currentUser: UserRead
  busyUserId: string | null
  onEdit: (user: UserRead) => void
  onToggleActive: (user: UserRead) => void
}

export function UsersTable({
  users,
  currentUser,
  busyUserId,
  onEdit,
  onToggleActive,
}: UsersTableProps) {
  if (users.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
        No hay usuarios en esta página.
      </p>
    )
  }
  return (
    <Table caption="Usuarios del sistema">
      <thead>
        <tr>
          <Th>Usuario</Th>
          <Th>Roles</Th>
          <Th>Estado</Th>
          <Th>
            <span className="sr-only">Acciones</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const isSelf = user.id === currentUser.id
          const manageable = canManageUser(currentUser, user)
          return (
            <tr key={user.id}>
              <Td>
                <div className="font-medium">{user.full_name}</div>
                <div className="text-slate-600">{user.email}</div>
              </Td>
              <Td>
                <ul className="flex flex-wrap gap-1.5" aria-label={`Roles de ${user.full_name}`}>
                  {user.roles.map((role) => (
                    <li key={role}>
                      <Badge tone="brand">{roleLabel(role)}</Badge>
                    </li>
                  ))}
                </ul>
              </Td>
              <Td>
                {user.is_active ? (
                  <Badge tone="success" icon="●">
                    Activo
                  </Badge>
                ) : (
                  <Badge tone="neutral" icon="○">
                    Inactivo
                  </Badge>
                )}
              </Td>
              <Td>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    disabled={!manageable}
                    onClick={() => onEdit(user)}
                    aria-label={`Editar a ${user.full_name}`}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!manageable || isSelf || busyUserId === user.id}
                    title={isSelf ? 'No puede desactivar su propia cuenta' : undefined}
                    onClick={() => onToggleActive(user)}
                    aria-label={`${user.is_active ? 'Desactivar' : 'Activar'} a ${user.full_name}`}
                  >
                    {user.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}
