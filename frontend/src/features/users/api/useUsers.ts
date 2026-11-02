import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'

import { apiGet, apiPatch, apiPost } from '@/shared/lib/http'
import type { UserCreate, UserRead, UserUpdate } from '@/shared/types/aliases'

export const USERS_PAGE_SIZE = 10
const USERS_KEY = ['users'] as const

/**
 * El API devuelve un arreglo sin total. Se pide una fila extra (`limit + 1`) solo para saber si
 * existe página siguiente; la fila sobrante no se muestra.
 */
export function useUsers(page: number) {
  return useQuery({
    queryKey: [...USERS_KEY, page],
    queryFn: ({ signal }) =>
      apiGet<UserRead[]>(`/users?limit=${USERS_PAGE_SIZE + 1}&offset=${page * USERS_PAGE_SIZE}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
    select: (rows) => ({
      users: rows.slice(0, USERS_PAGE_SIZE),
      hasNext: rows.length > USERS_PAGE_SIZE,
    }),
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserCreate) => apiPost<UserRead>('/users', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UserUpdate }) =>
      apiPatch<UserRead>(`/users/${id}`, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}
