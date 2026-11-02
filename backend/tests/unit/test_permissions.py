from app.domain.enums import Role
from app.domain.policies.permissions import (
    Permission,
    can,
    can_assign_roles,
    permissions_for,
    sees_full_portfolio,
)


def test_admin_roles_manage_users_and_audit() -> None:
    for role in (Role.SUPERUSER, Role.OWNER):
        assert can([role], Permission.USERS_MANAGE)
        assert can([role], Permission.AUDIT_READ)


def test_clinical_and_front_desk_roles_have_no_admin_permissions() -> None:
    admin = {Permission.USERS_READ, Permission.USERS_MANAGE, Permission.AUDIT_READ}
    for role in (Role.DOCTOR, Role.RECEPTION, Role.PATIENT):
        assert not admin & permissions_for([role])


def test_patient_role_has_no_staff_permissions_at_all() -> None:
    assert permissions_for([Role.PATIENT]) == frozenset()


def test_reception_manages_patients_and_leads_but_not_reports() -> None:
    assert can([Role.RECEPTION], Permission.PATIENTS_MANAGE)
    assert can([Role.RECEPTION], Permission.LEADS_MANAGE)
    assert not can([Role.RECEPTION], Permission.LEADS_REPORTS)


def test_only_owner_sees_lead_reports() -> None:
    assert can([Role.OWNER], Permission.LEADS_REPORTS)
    for role in (Role.SUPERUSER, Role.DOCTOR, Role.RECEPTION, Role.PATIENT):
        assert not can([role], Permission.LEADS_REPORTS)


def test_doctor_reads_but_never_manages_patients() -> None:
    assert can([Role.DOCTOR], Permission.PATIENTS_READ)
    assert not can([Role.DOCTOR], Permission.PATIENTS_MANAGE)


def test_full_portfolio_visibility_by_role() -> None:
    for role in (Role.SUPERUSER, Role.OWNER, Role.RECEPTION):
        assert sees_full_portfolio([role])
    assert not sees_full_portfolio([Role.DOCTOR])
    assert sees_full_portfolio([Role.OWNER, Role.DOCTOR])  # dueña-doctora ve todo


def test_owner_who_is_also_doctor_keeps_admin_permissions() -> None:
    assert can([Role.OWNER, Role.DOCTOR], Permission.USERS_MANAGE)


def test_only_superuser_can_assign_privileged_roles() -> None:
    assert can_assign_roles([Role.SUPERUSER], [Role.OWNER, Role.SUPERUSER])
    assert not can_assign_roles([Role.OWNER], [Role.OWNER])
    assert not can_assign_roles([Role.OWNER], [Role.SUPERUSER])


def test_owner_can_assign_non_privileged_roles() -> None:
    assert can_assign_roles([Role.OWNER], [Role.DOCTOR, Role.RECEPTION, Role.PATIENT])
