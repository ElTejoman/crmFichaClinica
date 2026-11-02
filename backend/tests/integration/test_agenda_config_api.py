"""Configuración de agenda: horarios, excepciones, salas y tipos de cita."""

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.enums import Role
from tests.agenda_helpers import iso
from tests.helpers import SessionFactory, create_user
from tests.integration.conftest import Agenda, AsRole


def block(doctor_id: str, weekday: int, start: str, end: str, **extra: object) -> dict[str, object]:
    return {
        "doctor_user_id": doctor_id,
        "weekday": weekday,
        "start_time": start,
        "end_time": end,
        **extra,
    }


# ------------------------------------------------------------------ permisos
@pytest.mark.parametrize(
    ("role", "expected"),
    [
        (Role.OWNER, 201),
        (Role.RECEPTION, 201),
        (Role.DOCTOR, 403),
        (Role.SUPERUSER, 403),
        (Role.PATIENT, 403),
    ],
)
async def test_configuration_permission_matrix(
    client: AsyncClient, as_role: AsRole, role: Role, expected: int
) -> None:
    headers = await as_role(role)
    room = await client.post("/rooms", json={"name": "Sala X"}, headers=headers)
    kind = await client.post(
        "/appointment-types",
        json={"specialty": "NUTRITION", "name": "Control", "duration_minutes": 30},
        headers=headers,
    )
    assert room.status_code == kind.status_code == expected


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        (Role.SUPERUSER, 200),
        (Role.OWNER, 200),
        (Role.RECEPTION, 200),
        (Role.DOCTOR, 200),
        (Role.PATIENT, 403),
    ],
)
async def test_reading_configuration_permission_matrix(
    client: AsyncClient, as_role: AsRole, role: Role, expected: int
) -> None:
    headers = await as_role(role)
    for path in ("/schedules", "/schedule-exceptions", "/rooms", "/appointment-types"):
        assert (await client.get(path, headers=headers)).status_code == expected


# ------------------------------------------------------------------ horarios
async def test_schedule_block_is_created_and_listed_with_doctor_name(agenda: Agenda) -> None:
    doctor = await agenda.new_doctor("otro@clinica-demo.pe", with_schedule=False)
    created = await agenda.client.post(
        "/schedules",
        json=block(str(doctor.id), 5, "09:00:00", "13:00:00", slot_minutes=20),
        headers=agenda.owner,
    )
    assert created.status_code == 201
    body = created.json()
    assert (body["weekday"], body["slot_minutes"], body["is_active"]) == (5, 20, True)
    assert body["doctor_name"] == "Usuario de Prueba"

    listed = await agenda.client.get(
        "/schedules", params={"doctor_id": str(doctor.id)}, headers=agenda.owner
    )
    assert [b["id"] for b in listed.json()] == [body["id"]]


async def test_overlapping_blocks_of_the_same_doctor_conflict_but_adjacent_ones_do_not(
    agenda: Agenda,
) -> None:
    doctor = str(agenda.doctor.id)
    # El horario estándar ya cubre lun 09-13 y 15-19.
    overlapping = await agenda.client.post(
        "/schedules", json=block(doctor, 0, "12:00:00", "14:00:00"), headers=agenda.owner
    )
    assert overlapping.status_code == 409
    assert overlapping.json()["error"]["code"] == "schedule_overlap"

    adjacent = await agenda.client.post(
        "/schedules", json=block(doctor, 0, "13:00:00", "15:00:00"), headers=agenda.owner
    )
    assert adjacent.status_code == 201  # contiguo, no se pisa


async def test_blocks_of_different_doctors_or_weekdays_never_conflict(agenda: Agenda) -> None:
    other = await agenda.new_doctor("otro@clinica-demo.pe")  # mismo horario, otro doctor
    assert other.id != agenda.doctor.id
    saturday = await agenda.client.post(
        "/schedules",
        json=block(str(agenda.doctor.id), 5, "09:00:00", "13:00:00"),
        headers=agenda.owner,
    )
    assert saturday.status_code == 201


async def test_blocks_with_non_overlapping_validity_windows_can_coexist(agenda: Agenda) -> None:
    doctor = await agenda.new_doctor("otro@clinica-demo.pe", with_schedule=False)
    first = block(str(doctor.id), 2, "09:00:00", "13:00:00", valid_to="2026-06-30")
    second = block(str(doctor.id), 2, "09:00:00", "13:00:00", valid_from="2026-07-01")
    assert (
        await agenda.client.post("/schedules", json=first, headers=agenda.owner)
    ).status_code == 201
    assert (
        await agenda.client.post("/schedules", json=second, headers=agenda.owner)
    ).status_code == 201


@pytest.mark.parametrize(
    ("start", "end", "extra"),
    [
        ("13:00:00", "09:00:00", {}),  # fin antes del inicio
        ("09:00:00", "09:00:00", {}),
        ("09:00:00", "13:00:00", {"valid_from": "2026-05-02", "valid_to": "2026-05-01"}),
    ],
)
async def test_invalid_blocks_are_rejected(
    agenda: Agenda, start: str, end: str, extra: dict[str, str]
) -> None:
    doctor = await agenda.new_doctor("otro@clinica-demo.pe", with_schedule=False)
    response = await agenda.client.post(
        "/schedules", json=block(str(doctor.id), 1, start, end, **extra), headers=agenda.owner
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_schedule"


@pytest.mark.parametrize(
    "bad", [{"weekday": 7}, {"weekday": -1}, {"slot_minutes": 1}, {"slot_minutes": 300}]
)
async def test_out_of_range_schedule_fields_are_rejected(
    agenda: Agenda, bad: dict[str, int]
) -> None:
    payload = {**block(str(agenda.doctor.id), 6, "09:00:00", "10:00:00"), **bad}
    assert (
        await agenda.client.post("/schedules", json=payload, headers=agenda.owner)
    ).status_code == 422


async def test_schedule_requires_an_active_doctor(
    agenda: Agenda, session_factory: SessionFactory
) -> None:
    reception_user = await create_user(session_factory, "r2@clinica-demo.pe", [Role.RECEPTION])
    inactive = await create_user(
        session_factory, "baja@clinica-demo.pe", [Role.DOCTOR], is_active=False
    )
    for user_id in (
        str(reception_user.id),
        str(inactive.id),
        "00000000-0000-0000-0000-000000000000",
    ):
        response = await agenda.client.post(
            "/schedules", json=block(user_id, 6, "09:00:00", "10:00:00"), headers=agenda.owner
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_doctor"


async def test_update_and_deactivate_block(agenda: Agenda) -> None:
    listed = await agenda.client.get("/schedules", headers=agenda.owner)
    monday_morning = next(
        b for b in listed.json() if b["weekday"] == 0 and b["start_time"] == "09:00:00"
    )

    shortened = await agenda.client.patch(
        f"/schedules/{monday_morning['id']}", json={"end_time": "12:00:00"}, headers=agenda.owner
    )
    assert shortened.status_code == 200 and shortened.json()["end_time"] == "12:00:00"

    deactivated = await agenda.client.patch(
        f"/schedules/{monday_morning['id']}", json={"is_active": False}, headers=agenda.owner
    )
    assert deactivated.json()["is_active"] is False
    active_ids = [
        b["id"] for b in (await agenda.client.get("/schedules", headers=agenda.owner)).json()
    ]
    assert monday_morning["id"] not in active_ids
    all_ids = [
        b["id"]
        for b in (
            await agenda.client.get(
                "/schedules", params={"include_inactive": True}, headers=agenda.owner
            )
        ).json()
    ]
    assert monday_morning["id"] in all_ids


async def test_update_that_creates_an_overlap_is_rejected(agenda: Agenda) -> None:
    listed = (await agenda.client.get("/schedules", headers=agenda.owner)).json()
    morning = next(b for b in listed if b["weekday"] == 1 and b["start_time"] == "09:00:00")
    response = await agenda.client.patch(
        f"/schedules/{morning['id']}", json={"end_time": "16:00:00"}, headers=agenda.owner
    )  # invadiría el bloque de la tarde (15-19)
    assert response.status_code == 409


async def test_unknown_schedule_is_404(agenda: Agenda) -> None:
    response = await agenda.client.patch(
        "/schedules/00000000-0000-0000-0000-000000000000",
        json={"slot_minutes": 20},
        headers=agenda.owner,
    )
    assert response.status_code == 404


# -------------------------------------------------------------- excepciones
async def test_exception_reports_open_appointments_it_affects_without_cancelling_them(
    agenda: Agenda,
) -> None:
    booked = await agenda.ok(9)
    await agenda.ok(10, patient=1)
    cancelled = await agenda.ok(11, patient=2)
    await agenda.client.post(
        f"/appointments/{cancelled['id']}/cancel",
        json={"reason": "No puede"},
        headers=agenda.reception,
    )

    created = await agenda.client.post(
        "/schedule-exceptions",
        json={
            "doctor_user_id": str(agenda.doctor.id),
            "start_date": str(agenda.monday),
            "end_date": str(agenda.monday),
            "reason": "Congreso",
        },
        headers=agenda.owner,
    )
    assert created.status_code == 201
    assert created.json()["affected_appointments"] == 2  # la cancelada no cuenta
    # No se cancelan solas: recepción debe reprogramarlas.
    still = await agenda.client.get(f"/appointments/{booked['id']}", headers=agenda.reception)
    assert still.json()["status"] == "SCHEDULED"


async def test_clinic_wide_exception_has_no_doctor_and_affects_everyone(agenda: Agenda) -> None:
    await agenda.ok(9)
    created = await agenda.client.post(
        "/schedule-exceptions",
        json={
            "start_date": str(agenda.monday),
            "end_date": str(agenda.monday),
            "reason": "Feriado",
        },
        headers=agenda.owner,
    )
    body = created.json()
    assert body["doctor_user_id"] is None and body["doctor_name"] is None
    assert body["affected_appointments"] == 1


async def test_exception_listing_filters_by_doctor_and_includes_clinic_holidays(
    agenda: Agenda,
) -> None:
    other = await agenda.new_doctor("otro@clinica-demo.pe")
    day = str(agenda.monday)
    for doctor_id, reason in (
        (str(agenda.doctor.id), "Mío"),
        (str(other.id), "Ajeno"),
        (None, "Feriado"),
    ):
        await agenda.client.post(
            "/schedule-exceptions",
            json={
                "doctor_user_id": doctor_id,
                "start_date": day,
                "end_date": day,
                "reason": reason,
            },
            headers=agenda.owner,
        )
    listed = await agenda.client.get(
        "/schedule-exceptions", params={"doctor_id": str(agenda.doctor.id)}, headers=agenda.owner
    )
    assert sorted(e["reason"] for e in listed.json()) == [
        "Feriado",
        "Mío",
    ]  # sin la del otro doctor


async def test_exception_validations(agenda: Agenda) -> None:
    day = agenda.monday
    reversed_range = await agenda.client.post(
        "/schedule-exceptions",
        json={"start_date": str(day), "end_date": str(day - timedelta(days=1)), "reason": "x"},
        headers=agenda.owner,
    )
    assert reversed_range.status_code == 422
    too_long = await agenda.client.post(
        "/schedule-exceptions",
        json={"start_date": str(day), "end_date": str(day + timedelta(days=400)), "reason": "x"},
        headers=agenda.owner,
    )
    assert too_long.status_code == 422
    no_reason = await agenda.client.post(
        "/schedule-exceptions",
        json={"start_date": str(day), "end_date": str(day), "reason": ""},
        headers=agenda.owner,
    )
    assert no_reason.status_code == 422
    not_a_doctor = await agenda.client.post(
        "/schedule-exceptions",
        json={
            "doctor_user_id": "00000000-0000-0000-0000-000000000000",
            "start_date": str(day),
            "end_date": str(day),
            "reason": "x",
        },
        headers=agenda.owner,
    )
    assert not_a_doctor.status_code == 422


async def test_deleting_an_exception_restores_availability(agenda: Agenda) -> None:
    created = (
        await agenda.client.post(
            "/schedule-exceptions",
            json={
                "start_date": str(agenda.monday),
                "end_date": str(agenda.monday),
                "reason": "Feriado",
            },
            headers=agenda.owner,
        )
    ).json()
    params: dict[str, str | int] = {
        "doctor_id": str(agenda.doctor.id),
        "from_date": str(agenda.monday),
        "to_date": str(agenda.monday),
        "duration_minutes": 60,
    }
    blocked = await agenda.client.get(
        "/appointments/availability", params=params, headers=agenda.reception
    )
    assert blocked.json()[0]["slots"] == []

    assert (
        await agenda.client.delete(f"/schedule-exceptions/{created['id']}", headers=agenda.owner)
    ).status_code == 204
    free = await agenda.client.get(
        "/appointments/availability", params=params, headers=agenda.reception
    )
    assert len(free.json()[0]["slots"]) > 0
    assert (
        await agenda.client.delete(f"/schedule-exceptions/{created['id']}", headers=agenda.owner)
    ).status_code == 404


# -------------------------------------------------------------------- salas
async def test_room_crud_and_unique_name(agenda: Agenda) -> None:
    created = await agenda.client.post(
        "/rooms", json={"name": "Sala dental", "specialties": ["DENTISTRY"]}, headers=agenda.owner
    )
    assert created.status_code == 201 and created.json()["specialties"] == ["DENTISTRY"]
    duplicate = await agenda.client.post(
        "/rooms", json={"name": "Sala dental"}, headers=agenda.owner
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "duplicate_name"

    renamed = await agenda.client.patch(
        f"/rooms/{created.json()['id']}",
        json={"name": "Sala dental 2", "specialties": []},
        headers=agenda.owner,
    )
    assert renamed.json()["name"] == "Sala dental 2" and renamed.json()["specialties"] == []
    clash = await agenda.client.patch(
        f"/rooms/{created.json()['id']}", json={"name": "Consultorio 1"}, headers=agenda.owner
    )
    assert clash.status_code == 409


async def test_inactive_rooms_are_hidden_by_default(agenda: Agenda) -> None:
    await agenda.client.patch(agenda_room(agenda), json={"is_active": False}, headers=agenda.owner)
    default = (await agenda.client.get("/rooms", headers=agenda.owner)).json()
    everything = (
        await agenda.client.get("/rooms", params={"include_inactive": True}, headers=agenda.owner)
    ).json()
    assert default == [] and len(everything) == 1


def agenda_room(agenda: Agenda) -> str:
    return f"/rooms/{agenda.room_id}"


# ------------------------------------------------------------ tipos de cita
async def test_appointment_type_crud_and_filters(agenda: Agenda) -> None:
    created = await agenda.client.post(
        "/appointment-types",
        json={"specialty": "NUTRITION", "name": "Control", "duration_minutes": 30},
        headers=agenda.owner,
    )
    assert created.status_code == 201
    duplicate = await agenda.client.post(
        "/appointment-types",
        json={"specialty": "NUTRITION", "name": "Control", "duration_minutes": 45},
        headers=agenda.owner,
    )
    assert duplicate.status_code == 409
    # El mismo nombre en OTRA especialidad es válido.
    other = await agenda.client.post(
        "/appointment-types",
        json={"specialty": "DENTISTRY", "name": "Control", "duration_minutes": 30},
        headers=agenda.owner,
    )
    assert other.status_code == 201

    updated = await agenda.client.patch(
        f"/appointment-types/{created.json()['id']}",
        json={"duration_minutes": 40},
        headers=agenda.owner,
    )
    assert updated.json()["duration_minutes"] == 40
    nutrition = (
        await agenda.client.get(
            "/appointment-types", params={"specialty": "NUTRITION"}, headers=agenda.owner
        )
    ).json()
    assert [t["name"] for t in nutrition] == ["Control"]


@pytest.mark.parametrize("minutes", [0, 3, 7, 245, 300])
async def test_appointment_type_duration_must_be_a_valid_multiple_of_five(
    agenda: Agenda, minutes: int
) -> None:
    response = await agenda.client.post(
        "/appointment-types",
        json={"specialty": "NUTRITION", "name": "X", "duration_minutes": minutes},
        headers=agenda.owner,
    )
    assert response.status_code == 422


async def test_configuration_changes_are_audited_without_free_text(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    await agenda.client.post("/rooms", json={"name": "Sala secreta"}, headers=agenda.owner)
    await agenda.client.post(
        "/schedule-exceptions",
        json={
            "start_date": str(agenda.monday),
            "end_date": str(agenda.monday),
            "reason": "Motivo privado",
        },
        headers=agenda.owner,
    )
    async with engine.connect() as conn:
        rows = (
            await conn.execute(text("SELECT resource_type, action, reason FROM audit_logs"))
        ).all()
    kinds = {(r[0], r[1]) for r in rows}
    assert {("room", "CREATE"), ("schedule_exception", "CREATE"), ("schedule", "CREATE")} <= kinds
    assert "Sala secreta" not in str(rows) and "Motivo privado" not in str(rows)


async def test_unused_helper_import_guard(agenda: Agenda) -> None:
    """`iso` se reexporta para otros módulos de test; esto asegura que sigue funcionando."""
    assert iso(agenda.monday, 9).endswith("+00:00")
