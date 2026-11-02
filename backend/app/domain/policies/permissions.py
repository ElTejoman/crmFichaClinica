"""Permisos y su asignación a roles (RBAC). Dominio puro: sin FastAPI ni SQL.

Cada fase añade permisos aquí (pacientes, agenda, clínico…). La matriz completa
está en docs/04-ROLES-Y-PERMISOS.md; este archivo es su versión ejecutable.
"""

from collections.abc import Iterable
from enum import StrEnum

from app.domain.enums import Role


class Permission(StrEnum):
    USERS_READ = "users:read"
    USERS_MANAGE = "users:manage"
    AUDIT_READ = "audit:read"


# Principio de mínimo privilegio: SUPERUSER administra la plataforma; el contenido clínico
# se le concederá solo vía *break-glass* auditado (Fase 6), no por rol.
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.SUPERUSER: frozenset(
        {Permission.USERS_READ, Permission.USERS_MANAGE, Permission.AUDIT_READ}
    ),
    Role.OWNER: frozenset({Permission.USERS_READ, Permission.USERS_MANAGE, Permission.AUDIT_READ}),
    Role.DOCTOR: frozenset(),
    Role.RECEPTION: frozenset(),
    Role.PATIENT: frozenset(),
}

# Roles "sensibles": solo un SUPERUSER puede otorgarlos o retirarlos (evita escalada de privilegios
# por parte de un OWNER comprometido o de un error de configuración).
PRIVILEGED_ROLES: frozenset[Role] = frozenset({Role.SUPERUSER, Role.OWNER})


def permissions_for(roles: Iterable[Role]) -> frozenset[Permission]:
    """Unión de los permisos de todos los roles del usuario."""
    granted: set[Permission] = set()
    for role in roles:
        granted |= ROLE_PERMISSIONS[role]
    return frozenset(granted)


def can(roles: Iterable[Role], permission: Permission) -> bool:
    return permission in permissions_for(roles)


def can_assign_roles(actor_roles: Iterable[Role], changed_roles: Iterable[Role]) -> bool:
    """¿Puede el actor otorgar/retirar estos roles? Los privilegiados exigen SUPERUSER."""
    needs_superuser = any(role in PRIVILEGED_ROLES for role in changed_roles)
    return not needs_superuser or Role.SUPERUSER in set(actor_roles)
