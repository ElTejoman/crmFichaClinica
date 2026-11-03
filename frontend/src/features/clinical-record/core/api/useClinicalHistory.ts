import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet, apiPatch, apiPost } from '@/shared/lib/http'
import type {
  AllergyCreate,
  AllergyRead,
  AllergyUpdate,
  ClinicalSummary,
  ConditionCreate,
  ConditionRead,
  ConditionUpdate,
  MedicationCreate,
  MedicationRead,
  MedicationUpdate,
} from '@/shared/types/aliases'

import { clinicalKeys } from './keys'

/** Alertas y contadores de la ficha. Cada lectura queda auditada en el servidor. */
export function useClinicalSummary(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.summary(patientId),
    queryFn: ({ signal }) =>
      apiGet<ClinicalSummary>(`/patients/${patientId}/clinical-summary`, { signal }),
  })
}

/* Las listas de gestión piden también los inactivos: no hay borrado, solo «inactivo». */
const ALL_RECORDS = '?include_inactive=true'

export function useAllergies(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.allergies(patientId),
    queryFn: ({ signal }) =>
      apiGet<AllergyRead[]>(`/patients/${patientId}/allergies${ALL_RECORDS}`, { signal }),
  })
}

export function useMedications(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.medications(patientId),
    queryFn: ({ signal }) =>
      apiGet<MedicationRead[]>(`/patients/${patientId}/medications${ALL_RECORDS}`, { signal }),
  })
}

export function useConditions(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.conditions(patientId),
    queryFn: ({ signal }) =>
      apiGet<ConditionRead[]>(`/patients/${patientId}/conditions${ALL_RECORDS}`, { signal }),
  })
}

/** Tras cambiar un antecedente se refrescan su lista y el resumen (banner de alertas). */
function useInvalidateHistory(patientId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: clinicalKeys.summary(patientId) }),
      queryClient.invalidateQueries({ queryKey: clinicalKeys.allergies(patientId) }),
      queryClient.invalidateQueries({ queryKey: clinicalKeys.medications(patientId) }),
      queryClient.invalidateQueries({ queryKey: clinicalKeys.conditions(patientId) }),
    ])
}

export function useAddAllergy(patientId: string) {
  const invalidate = useInvalidateHistory(patientId)
  return useMutation({
    mutationFn: (body: AllergyCreate) =>
      apiPost<AllergyRead>(`/patients/${patientId}/allergies`, body),
    onSuccess: invalidate,
  })
}

export function useUpdateAllergy(patientId: string) {
  const invalidate = useInvalidateHistory(patientId)
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: AllergyUpdate }) =>
      apiPatch<AllergyRead>(`/allergies/${id}`, changes),
    onSuccess: invalidate,
  })
}

export function useAddMedication(patientId: string) {
  const invalidate = useInvalidateHistory(patientId)
  return useMutation({
    mutationFn: (body: MedicationCreate) =>
      apiPost<MedicationRead>(`/patients/${patientId}/medications`, body),
    onSuccess: invalidate,
  })
}

export function useUpdateMedication(patientId: string) {
  const invalidate = useInvalidateHistory(patientId)
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: MedicationUpdate }) =>
      apiPatch<MedicationRead>(`/medications/${id}`, changes),
    onSuccess: invalidate,
  })
}

export function useAddCondition(patientId: string) {
  const invalidate = useInvalidateHistory(patientId)
  return useMutation({
    mutationFn: (body: ConditionCreate) =>
      apiPost<ConditionRead>(`/patients/${patientId}/conditions`, body),
    onSuccess: invalidate,
  })
}

export function useUpdateCondition(patientId: string) {
  const invalidate = useInvalidateHistory(patientId)
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: ConditionUpdate }) =>
      apiPatch<ConditionRead>(`/conditions/${id}`, changes),
    onSuccess: invalidate,
  })
}
