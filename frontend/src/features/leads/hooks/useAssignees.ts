import { useCallback, useMemo } from 'react'

import { useDoctors } from '@/entities/doctor'

export interface CurrentUser {
  id: string
  full_name: string
}

export interface AssigneeOption {
  value: string
  label: string
}

const UNASSIGNED_LABEL = 'Sin asignar'
// Respaldo: el API ya devuelve `assigned_to_name` en cada lead; esto solo cubre respuestas sin él.
const UNKNOWN_ASSIGNEE_LABEL = 'Otro responsable'

/**
 * Responsables posibles y cómo mostrarlos. Salen del directorio de doctores más el usuario actual
 * (que puede ser recepción/dueño y no figurar como doctor).
 */
export function useAssignees(currentUser: CurrentUser) {
  const doctors = useDoctors()

  const options = useMemo<AssigneeOption[]>(() => {
    const list = (doctors.data ?? []).map((d) => ({ value: d.id, label: d.full_name }))
    const hasSelf = list.some((o) => o.value === currentUser.id)
    return [
      ...(hasSelf ? [] : [{ value: currentUser.id, label: `${currentUser.full_name} (yo)` }]),
      ...list,
    ]
  }, [doctors.data, currentUser.id, currentUser.full_name])

  const nameOf = useCallback(
    (id: string | null): string => {
      if (!id) return UNASSIGNED_LABEL
      return options.find((o) => o.value === id)?.label ?? UNKNOWN_ASSIGNEE_LABEL
    },
    [options],
  )

  return { options, nameOf }
}
