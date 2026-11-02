import { canAssignRole } from '@/entities/user'
import { ALL_ROLES, ROLE_LABELS } from '@/shared/lib/labels'
import type { Role } from '@/shared/types/aliases'
import { CheckboxGroup } from '@/shared/ui'

interface RoleCheckboxesProps {
  value: Role[]
  onChange: (roles: Role[]) => void
  /** Roles de quien opera: solo un SUPERUSER puede tocar SUPERUSER/OWNER. */
  actorRoles: readonly Role[]
  error?: string | undefined
}

/**
 * Los roles privilegiados se muestran deshabilitados (no ocultos) para que, al editar a alguien
 * que ya los tiene, la lista enviada no los retire sin querer. El servidor igual lo valida.
 */
export function RoleCheckboxes({ value, onChange, actorRoles, error }: RoleCheckboxesProps) {
  const options = ALL_ROLES.map((role) => {
    const disabled = !canAssignRole(actorRoles, role)
    return {
      value: role,
      label: ROLE_LABELS[role],
      disabled,
      ...(disabled ? { hint: 'solo superusuario' } : {}),
    }
  })
  return (
    <CheckboxGroup
      legend="Roles"
      options={options}
      value={value}
      onChange={onChange}
      error={error}
      required
    />
  )
}
