from app.domain.enums import Role
from app.domain.policies.permissions import Permission, can, can_assign_roles, permissions_for


def test_admin_roles_manage_users_and_audit() -> None:
    for role in (Role.SUPERUSER, Role.OWNER):
        assert can([role], Permission.USERS_MANAGE)
        assert can([role], Permission.AUDIT_READ)


def test_clinical_and_front_desk_roles_have_no_admin_permissions() -> None:
    for role in (Role.DOCTOR, Role.RECEPTION, Role.PATIENT):
        assert permissions_for([role]) == frozenset()


def test_owner_who_is_also_doctor_keeps_admin_permissions() -> None:
    assert can([Role.OWNER, Role.DOCTOR], Permission.USERS_MANAGE)


def test_only_superuser_can_assign_privileged_roles() -> None:
    assert can_assign_roles([Role.SUPERUSER], [Role.OWNER, Role.SUPERUSER])
    assert not can_assign_roles([Role.OWNER], [Role.OWNER])
    assert not can_assign_roles([Role.OWNER], [Role.SUPERUSER])


def test_owner_can_assign_non_privileged_roles() -> None:
    assert can_assign_roles([Role.OWNER], [Role.DOCTOR, Role.RECEPTION, Role.PATIENT])
