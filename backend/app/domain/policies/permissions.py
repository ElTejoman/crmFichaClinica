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
    PATIENTS_READ = "patients:read"
    PATIENTS_MANAGE = "patients:manage"
    LEADS_READ = "leads:read"
    LEADS_MANAGE = "leads:manage"
    LEADS_REPORTS = "leads:reports"
    AGENDA_READ = "agenda:read"  # ver citas (el doctor, solo las suyas) y catálogos de agenda
    AGENDA_MANAGE = "agenda:manage"  # agendar, confirmar, check-in, cancelar, reprogramar
    AGENDA_ATTEND = "agenda:attend"  # iniciar y completar la atención de SUS citas
    SCHEDULE_MANAGE = "schedule:manage"  # horarios, excepciones, salas y tipos de cita


_ADMIN_PERMISSIONS = frozenset(
    {Permission.USERS_READ, Permission.USERS_MANAGE, Permission.AUDIT_READ}
)

# Principio de mínimo privilegio: SUPERUSER administra la plataforma; el contenido clínico
# se le concederá solo vía *break-glass* auditado (Fase 6), no por rol.
# Pacientes y CRM aquí son datos *administrativos*: el contenido clínico tendrá permisos
# propios en la Fase 4 y recepción nunca los recibirá.
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.SUPERUSER: _ADMIN_PERMISSIONS
    | {Permission.PATIENTS_READ, Permission.LEADS_READ, Permission.AGENDA_READ},
    Role.OWNER: _ADMIN_PERMISSIONS
    | {
        Permission.PATIENTS_READ,
        Permission.PATIENTS_MANAGE,
        Permission.LEADS_READ,
        Permission.LEADS_MANAGE,
        Permission.LEADS_REPORTS,
        Permission.AGENDA_READ,
        Permission.AGENDA_MANAGE,
        Permission.SCHEDULE_MANAGE,
    },
    Role.DOCTOR: frozenset(
        {
            Permission.PATIENTS_READ,
            Permission.LEADS_READ,
            Permission.AGENDA_READ,
            Permission.AGENDA_ATTEND,
        }
    ),
    Role.RECEPTION: frozenset(
        {
            Permission.PATIENTS_READ,
            Permission.PATIENTS_MANAGE,
            Permission.LEADS_READ,
            Permission.LEADS_MANAGE,
            Permission.AGENDA_READ,
            Permission.AGENDA_MANAGE,
            Permission.SCHEDULE_MANAGE,
        }
    ),
    Role.PATIENT: frozenset(),
}

# Roles "sensibles": solo un SUPERUSER puede otorgarlos o retirarlos (evita escalada de privilegios
# por parte de un OWNER comprometido o de un error de configuración).
PRIVILEGED_ROLES: frozenset[Role] = frozenset({Role.SUPERUSER, Role.OWNER})

# Roles con visión completa de la cartera administrativa. Un DOCTOR "puro" solo ve a los
# pacientes con quienes tiene relación terapéutica y a los leads que se le asignaron.
_FULL_PORTFOLIO_ROLES: frozenset[Role] = frozenset({Role.SUPERUSER, Role.OWNER, Role.RECEPTION})


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


def sees_full_portfolio(roles: Iterable[Role]) -> bool:
    """¿Ve a todos los pacientes/leads? (si no, solo los suyos: relación terapéutica)."""
    return any(role in _FULL_PORTFOLIO_ROLES for role in roles)
