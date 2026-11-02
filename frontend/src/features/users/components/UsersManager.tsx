import { useState } from 'react'

import { ApiError } from '@/shared/lib/http'
import type { UserRead } from '@/shared/types/aliases'
import { Alert, Button, Pagination, Spinner } from '@/shared/ui'

import { useUpdateUser, useUsers } from '../api/useUsers'
import { UserCreateForm } from './UserCreateForm'
import { UserEditForm } from './UserEditForm'
import { UsersTable } from './UsersTable'

type Panel = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; user: UserRead }

/** Listado + alta + edición. `currentUser` lo aporta la página (una feature no importa de otra). */
export function UsersManager({ currentUser }: { currentUser: UserRead }) {
  const [page, setPage] = useState(0)
  const [panel, setPanel] = useState<Panel>({ kind: 'closed' })
  const [message, setMessage] = useState<string | null>(null)
  const users = useUsers(page)
  const updateUser = useUpdateUser()
  const [toggleError, setToggleError] = useState<string | null>(null)

  function showSaved(text: string) {
    setMessage(text)
    setPanel({ kind: 'closed' })
  }

  function toggleActive(user: UserRead) {
    setToggleError(null)
    setMessage(null)
    updateUser.mutate(
      { id: user.id, changes: { is_active: !user.is_active } },
      {
        onSuccess: () =>
          setMessage(
            `${user.full_name} ${user.is_active ? 'fue desactivado/a' : 'fue activado/a'}.`,
          ),
        onError: (error) =>
          setToggleError(
            error instanceof ApiError ? error.message : 'No se pudo cambiar el estado.',
          ),
      },
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Usuarios</h1>
        {panel.kind === 'closed' && (
          <Button
            onClick={() => {
              setMessage(null)
              setPanel({ kind: 'create' })
            }}
          >
            Nuevo usuario
          </Button>
        )}
      </div>

      {message && <Alert tone="success">{message}</Alert>}
      {toggleError && <Alert tone="error">{toggleError}</Alert>}

      {panel.kind === 'create' && (
        <UserCreateForm
          actorRoles={currentUser.roles}
          onCreated={(user) => showSaved(`Usuario ${user.full_name} creado.`)}
          onCancel={() => setPanel({ kind: 'closed' })}
        />
      )}
      {panel.kind === 'edit' && (
        <UserEditForm
          key={panel.user.id}
          user={panel.user}
          actorRoles={currentUser.roles}
          onSaved={(user) => showSaved(`Cambios guardados para ${user.full_name}.`)}
          onCancel={() => setPanel({ kind: 'closed' })}
        />
      )}

      {users.isPending && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <Spinner /> Cargando usuarios…
        </p>
      )}
      {users.isError && (
        <Alert tone="error">
          {users.error instanceof ApiError ? users.error.message : 'No se pudo cargar la lista.'}
        </Alert>
      )}
      {users.data && (
        <>
          <UsersTable
            users={users.data.users}
            currentUser={currentUser}
            busyUserId={updateUser.isPending ? (updateUser.variables?.id ?? null) : null}
            onEdit={(user) => {
              setMessage(null)
              setPanel({ kind: 'edit', user })
            }}
            onToggleActive={toggleActive}
          />
          <Pagination
            page={page}
            hasNext={users.data.hasNext}
            onPageChange={setPage}
            disabled={users.isFetching}
          />
        </>
      )}
    </div>
  )
}
