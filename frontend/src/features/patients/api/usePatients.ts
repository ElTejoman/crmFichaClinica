import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/lib/http'
import type {
  CareTeamRead,
  PatientCreate,
  PatientRead,
  PatientSummary,
  PatientUpdate,
} from '@/shared/types/aliases'

export const PATIENTS_PAGE_SIZE = 20
const PATIENTS_KEY = ['patients'] as const
const careTeamKey = (patientId: string) => ['care-team', patientId] as const

export interface PatientSearch {
  q: string
  includeInactive: boolean
  page: number
}

/** Igual que usuarios: se pide una fila de más (`limit + 1`) solo para saber si hay página siguiente. */
export function usePatientSearch({ q, includeInactive, page }: PatientSearch) {
  return useQuery({
    queryKey: [...PATIENTS_KEY, 'list', { q, includeInactive, page }],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        limit: String(PATIENTS_PAGE_SIZE + 1),
        offset: String(page * PATIENTS_PAGE_SIZE),
      })
      if (q) params.set('q', q)
      if (includeInactive) params.set('include_inactive', 'true')
      return apiGet<PatientSummary[]>(`/patients?${params.toString()}`, { signal })
    },
    placeholderData: keepPreviousData,
    select: (rows) => ({
      patients: rows.slice(0, PATIENTS_PAGE_SIZE),
      hasNext: rows.length > PATIENTS_PAGE_SIZE,
    }),
  })
}

/** Cada lectura individual queda auditada en el servidor; por eso la caché se respeta (staleTime global). */
export function usePatient(patientId: string) {
  return useQuery({
    queryKey: [...PATIENTS_KEY, 'detail', patientId],
    queryFn: ({ signal }) => apiGet<PatientRead>(`/patients/${patientId}`, { signal }),
  })
}

export function useCreatePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PatientCreate) => apiPost<PatientRead>('/patients', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PATIENTS_KEY }),
  })
}

export function useUpdatePatient(patientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: PatientUpdate) =>
      apiPatch<PatientRead>(`/patients/${patientId}`, changes),
    onSuccess: (patient) => {
      queryClient.setQueryData([...PATIENTS_KEY, 'detail', patientId], patient)
      return queryClient.invalidateQueries({ queryKey: [...PATIENTS_KEY, 'list'] })
    },
  })
}

export function useCareTeam(patientId: string) {
  return useQuery({
    queryKey: careTeamKey(patientId),
    queryFn: ({ signal }) => apiGet<CareTeamRead[]>(`/patients/${patientId}/care-team`, { signal }),
  })
}

export function useAssignDoctor(patientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (doctorUserId: string) =>
      apiPost<CareTeamRead>(`/patients/${patientId}/care-team`, { doctor_user_id: doctorUserId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: careTeamKey(patientId) }),
  })
}

export function useEndAssignment(patientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (doctorUserId: string) =>
      apiDelete(`/patients/${patientId}/care-team/${doctorUserId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: careTeamKey(patientId) }),
  })
}
