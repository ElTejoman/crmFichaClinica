import { useAuth } from '@/features/auth'
import { UsersManager } from '@/features/users'

export function UsersPage() {
  const { user } = useAuth()
  // RoleGuard ya garantiza sesión; el chequeo estrecha el tipo sin aserciones.
  return user ? <UsersManager currentUser={user} /> : null
}
