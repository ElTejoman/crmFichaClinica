"""Citas: reglas de agendado, solapamientos, series, reprogramación, estados y visibilidad."""

import asyncio
import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.clock import lima_today, utcnow
from app.domain.agenda_rules import at_clinic_time
from app.domain.enums import Role, Specialty
from tests.agenda_helpers import insert_appointment, iso
from tests.integration.conftest import Agenda


async def audit_rows(engine: AsyncEngine, action: str | None = None) -> list[dict[str, Any]]:
    async with engine.connect() as conn:
        if action:
            statement = text("SELECT * FROM audit_logs WHERE action = :a ORDER BY id")
            rows = await conn.execute(statement, {"a": action})
        else:
            rows = await conn.execute(text("SELECT * FROM audit_logs ORDER BY id"))
        return [dict(r._mapping) for r in rows]


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
async def test_booking_permission_matrix(agenda: Agenda, role: Role, expected: int) -> None:
    headers = await agenda.as_role(role, f"{role.value.lower()}-x@clinica-demo.pe")
    assert (await agenda.book(9, headers=headers)).status_code == expected


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
async def test_reading_appointments_permission_matrix(
    agenda: Agenda, role: Role, expected: int
) -> None:
    headers = await agenda.as_role(role, f"{role.value.lower()}-y@clinica-demo.pe")
    assert (await agenda.client.get("/appointments", headers=headers)).status_code == expected


async def test_unauthenticated_requests_are_rejected(agenda: Agenda) -> None:
    assert (await agenda.client.get("/appointments")).status_code == 401
    assert (await agenda.client.post("/appointments", json={})).status_code == 401


# ------------------------------------------------------------------ agendar
async def test_booking_uses_type_duration_and_returns_denormalized_names(agenda: Agenda) -> None:
    created = await agenda.ok(9, room_id=agenda.room_id, admin_notes="Viene con su mamá")
    assert created["status"] == "SCHEDULED"
    assert datetime.fromisoformat(created["ends_at"]) - datetime.fromisoformat(
        created["starts_at"]
    ) == timedelta(hours=1)
    assert created["patient_name"] == "Ana Gómez Ríos"
    assert created["doctor_name"] == "Dra. Acu"
    assert created["room_name"] == "Consultorio 1" and created["type_name"] == "Primera consulta"
    assert created["admin_notes"] == "Viene con su mamá" and created["series_id"] is None


async def test_explicit_duration_overrides_the_type_default(agenda: Agenda) -> None:
    created = await agenda.ok(9, duration_minutes=30)
    span = datetime.fromisoformat(created["ends_at"]) - datetime.fromisoformat(created["starts_at"])
    assert span == timedelta(minutes=30)


async def test_duration_or_type_is_required(agenda: Agenda) -> None:
    response = await agenda.book(9, appointment_type_id=None)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "duration_required"


@pytest.mark.parametrize("minutes", [0, 3, 7, 245])
async def test_invalid_explicit_durations_are_rejected(agenda: Agenda, minutes: int) -> None:
    assert (await agenda.book(9, duration_minutes=minutes)).status_code == 422


async def test_naive_datetime_is_rejected(agenda: Agenda) -> None:
    response = await agenda.book(9, starts_at=f"{agenda.monday}T09:00:00")
    assert response.status_code == 422


async def test_booking_creates_the_care_relationship_so_the_doctor_can_see_the_patient(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    patient_id = agenda.patients[0]["id"]
    before = await agenda.client.get(f"/patients/{patient_id}", headers=agenda.doctor_headers)
    assert before.status_code == 403  # sin relación terapéutica

    await agenda.ok(9)
    after = await agenda.client.get(f"/patients/{patient_id}", headers=agenda.doctor_headers)
    assert after.status_code == 200

    await agenda.ok(10)  # una segunda cita NO duplica la relación
    team = await agenda.client.get(f"/patients/{patient_id}/care-team", headers=agenda.reception)
    assert len(team.json()) == 1
    reasons = [
        r["reason"] for r in await audit_rows(engine, "CREATE") if r["resource_type"] == "care_team"
    ]
    assert reasons == ["al agendar"]


async def test_unknown_patient_is_404_and_archived_patient_is_rejected(agenda: Agenda) -> None:
    unknown = await agenda.book(9, patient_id="00000000-0000-0000-0000-000000000000")
    assert unknown.status_code == 404

    patient_id = agenda.patients[1]["id"]
    await agenda.client.patch(
        f"/patients/{patient_id}", json={"is_active": False}, headers=agenda.reception
    )
    archived = await agenda.book(9, patient=1)
    assert archived.status_code == 422
    assert archived.json()["error"]["code"] == "patient_inactive"


async def test_doctor_must_be_active_and_offer_the_specialty(agenda: Agenda) -> None:
    nutritionist = await agenda.new_doctor("nutri@clinica-demo.pe", {Specialty.NUTRITION})
    mismatch = await agenda.book(9, doctor=nutritionist)  # la cita es de ACUPUNCTURE
    assert mismatch.status_code == 422
    assert mismatch.json()["error"]["code"] == "doctor_specialty_mismatch"

    not_a_doctor = await agenda.book(9, doctor_user_id=str(uuid.uuid4()))
    assert not_a_doctor.status_code == 422
    assert not_a_doctor.json()["error"]["code"] == "invalid_doctor"


async def test_type_must_belong_to_the_specialty_and_be_active(agenda: Agenda) -> None:
    other_type = (
        await agenda.client.post(
            "/appointment-types",
            json={"specialty": "NUTRITION", "name": "Control", "duration_minutes": 30},
            headers=agenda.owner,
        )
    ).json()
    wrong = await agenda.book(9, appointment_type_id=other_type["id"])
    assert wrong.status_code == 422
    assert wrong.json()["error"]["code"] == "invalid_appointment_type"

    await agenda.client.patch(
        f"/appointment-types/{agenda.type_id}", json={"is_active": False}, headers=agenda.owner
    )
    assert (await agenda.book(9)).json()["error"]["code"] == "invalid_appointment_type"


async def test_room_must_exist_be_active_and_suit_the_specialty(agenda: Agenda) -> None:
    dental = (
        await agenda.client.post(
            "/rooms", json={"name": "Dental", "specialties": ["DENTISTRY"]}, headers=agenda.owner
        )
    ).json()
    incompatible = await agenda.book(9, room_id=dental["id"])
    assert (
        incompatible.status_code == 422 and incompatible.json()["error"]["code"] == "invalid_room"
    )
    unknown = await agenda.book(9, room_id=str(uuid.uuid4()))
    assert unknown.json()["error"]["code"] == "invalid_room"

    await agenda.client.patch(
        f"/rooms/{agenda.room_id}", json={"is_active": False}, headers=agenda.owner
    )
    assert (await agenda.book(9, room_id=agenda.room_id)).json()["error"]["code"] == "invalid_room"


async def test_past_appointments_are_rejected(agenda: Agenda) -> None:
    yesterday = lima_today() - timedelta(days=1)
    response = await agenda.book(9, day=yesterday)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "appointment_in_past"


# ------------------------------------------------------------ horario laboral
@pytest.mark.parametrize(
    ("hour", "minute", "minutes"),
    [
        (8, 0, 30),  # antes de abrir
        (12, 30, 60),  # termina a las 13:30: se pasa del bloque
        (13, 0, 30),  # hora de almuerzo
        (14, 30, 60),  # empieza en el almuerzo
        (12, 30, 150),  # cruza el almuerzo
        (19, 0, 30),  # después de cerrar
    ],
)
async def test_booking_outside_working_hours_is_rejected(
    agenda: Agenda, hour: int, minute: int, minutes: int
) -> None:
    response = await agenda.book(hour, minute, duration_minutes=minutes, appointment_type_id=None)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "outside_working_hours"


@pytest.mark.parametrize(
    ("hour", "minute", "minutes"), [(9, 0, 30), (12, 30, 30), (15, 0, 240), (18, 30, 30)]
)
async def test_booking_inside_working_hours_is_accepted_up_to_the_edges(
    agenda: Agenda, hour: int, minute: int, minutes: int
) -> None:
    response = await agenda.book(hour, minute, duration_minutes=minutes, appointment_type_id=None)
    assert response.status_code == 201, response.text


async def test_weekend_without_a_block_is_rejected(agenda: Agenda) -> None:
    saturday = agenda.monday + timedelta(days=5)
    assert (await agenda.book(9, day=saturday)).json()["error"]["code"] == "outside_working_hours"


async def test_doctor_without_any_schedule_gets_a_specific_message(agenda: Agenda) -> None:
    unscheduled = await agenda.new_doctor("sin.horario@clinica-demo.pe", with_schedule=False)
    response = await agenda.book(9, doctor=unscheduled)
    assert response.status_code == 422
    assert "horario de atención configurado" in response.json()["error"]["message"]


async def test_doctor_exception_blocks_booking_and_mentions_the_reason(agenda: Agenda) -> None:
    await agenda.client.post(
        "/schedule-exceptions",
        json={
            "doctor_user_id": str(agenda.doctor.id),
            "start_date": str(agenda.monday),
            "end_date": str(agenda.monday),
            "reason": "Vacaciones",
        },
        headers=agenda.owner,
    )
    response = await agenda.book(9)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "doctor_unavailable"
    assert "Vacaciones" in response.json()["error"]["message"]
    # El día siguiente sigue disponible.
    assert (await agenda.book(9, day=agenda.monday + timedelta(days=1))).status_code == 201


async def test_clinic_holiday_blocks_every_doctor_and_only_that_doctors_exception_blocks_one(
    agenda: Agenda,
) -> None:
    other = await agenda.new_doctor("otra@clinica-demo.pe")
    await agenda.client.post(
        "/schedule-exceptions",
        json={
            "doctor_user_id": str(other.id),
            "start_date": str(agenda.monday),
            "end_date": str(agenda.monday),
            "reason": "Congreso",
        },
        headers=agenda.owner,
    )
    assert (await agenda.book(9, doctor=other)).status_code == 422
    assert (await agenda.book(9)).status_code == 201  # la excepción de otro doctor no afecta

    await agenda.client.post(
        "/schedule-exceptions",
        json={
            "start_date": str(agenda.monday),
            "end_date": str(agenda.monday),
            "reason": "Feriado",
        },
        headers=agenda.owner,
    )
    assert (await agenda.book(11)).json()["error"]["code"] == "doctor_unavailable"


# -------------------------------------------------------------- solapamientos
async def test_overlapping_doctor_slot_conflicts_and_reports_only_times(agenda: Agenda) -> None:
    await agenda.ok(9)  # 09:00-10:00
    response = await agenda.book(9, 30, patient=1)  # 09:30-10:30, otro paciente
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "appointment_overlap" and error["details"]["resource"] == "doctor"
    conflict = error["details"]["conflicts"][0]
    assert set(conflict) == {"resource", "starts_at", "ends_at"}  # no revela al otro paciente
    assert "Ana" not in response.text


async def test_back_to_back_appointments_do_not_conflict(agenda: Agenda) -> None:
    await agenda.ok(9)  # 09:00-10:00
    assert (await agenda.book(10, patient=1)).status_code == 201  # empieza cuando termina
    assert (await agenda.book(11, patient=2, duration_minutes=60)).status_code == 201


async def test_same_patient_cannot_be_in_two_places_at_once(agenda: Agenda) -> None:
    other = await agenda.new_doctor("otra@clinica-demo.pe")
    await agenda.ok(9)
    response = await agenda.book(9, 30, doctor=other)  # mismo paciente, otro doctor
    assert response.status_code == 409
    assert response.json()["error"]["details"]["resource"] == "patient"


async def test_same_room_cannot_be_used_twice(agenda: Agenda) -> None:
    other = await agenda.new_doctor("otra@clinica-demo.pe")
    await agenda.ok(9, room_id=agenda.room_id)
    response = await agenda.book(9, patient=1, doctor=other, room_id=agenda.room_id)
    assert response.status_code == 409
    assert response.json()["error"]["details"]["resource"] == "room"
    # Sin sala (o con otra) sí se puede.
    assert (await agenda.book(9, patient=1, doctor=other)).status_code == 201


async def test_cancelling_frees_the_slot_for_someone_else(agenda: Agenda) -> None:
    first = await agenda.ok(9)
    assert (await agenda.book(9, patient=1)).status_code == 409
    cancel = await agenda.client.post(
        f"/appointments/{first['id']}/cancel",
        json={"reason": "Paciente avisó"},
        headers=agenda.reception,
    )
    assert cancel.status_code == 200
    assert (await agenda.book(9, patient=1)).status_code == 201


async def test_simultaneous_bookings_of_the_same_slot_yield_exactly_one_winner(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    """Carrera real contra la BD: 6 peticiones al mismo hueco, solo una puede ganar."""
    responses = await asyncio.gather(*(agenda.book(9, patient=i % 3) for i in range(6)))
    codes = sorted(r.status_code for r in responses)
    assert codes == [201, 409, 409, 409, 409, 409]
    async with engine.connect() as conn:
        count = (await conn.execute(text("SELECT count(*) FROM appointments"))).scalar_one()
    assert count == 1


# --------------------------------------- restricciones de exclusión en la BD
async def _raw_insert(
    engine: AsyncEngine,
    *,
    patient: str,
    doctor: str,
    start: datetime,
    end: datetime,
    status: str = "SCHEDULED",
    room: str | None = None,
) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO appointments (id, patient_id, doctor_user_id, room_id, specialty, "
                "starts_at, ends_at, status) VALUES (:id, :p, :d, :r, 'ACUPUNCTURE', :s, :e, :st)"
            ),
            {
                "id": uuid.uuid4(),
                "p": patient,
                "d": doctor,
                "r": room,
                "s": start,
                "e": end,
                "st": status,
            },
        )


async def test_database_itself_rejects_overlaps_even_bypassing_the_api(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    """Defensa en profundidad: la garantía vive en PostgreSQL, no solo en el servicio."""
    created = await agenda.ok(9, room_id=agenda.room_id)
    start = datetime.fromisoformat(created["starts_at"])
    doctor = str(agenda.doctor.id)
    inside = start + timedelta(minutes=15)

    with pytest.raises(DBAPIError, match="ex_appointments_doctor_overlap"):
        await _raw_insert(
            engine,
            patient=agenda.patients[1]["id"],
            doctor=doctor,
            start=inside,
            end=inside + timedelta(minutes=30),
        )
    other = await agenda.new_doctor("otra@clinica-demo.pe")
    with pytest.raises(DBAPIError, match="ex_appointments_patient_overlap"):
        await _raw_insert(
            engine,
            patient=agenda.patients[0]["id"],
            doctor=str(other.id),
            start=inside,
            end=inside + timedelta(minutes=30),
        )
    with pytest.raises(DBAPIError, match="ex_appointments_room_overlap"):
        await _raw_insert(
            engine,
            patient=agenda.patients[1]["id"],
            doctor=str(other.id),
            start=inside,
            end=inside + timedelta(minutes=30),
            room=agenda.room_id,
        )

    # Una cita CANCELADA no ocupa el hueco; y contigua tampoco.
    await _raw_insert(
        engine,
        patient=agenda.patients[1]["id"],
        doctor=doctor,
        start=inside,
        end=inside + timedelta(minutes=30),
        status="CANCELLED",
    )
    await _raw_insert(
        engine,
        patient=agenda.patients[2]["id"],
        doctor=doctor,
        start=start + timedelta(hours=1),
        end=start + timedelta(hours=2),
    )


async def test_database_rejects_inverted_time_ranges(agenda: Agenda, engine: AsyncEngine) -> None:
    start = at_clinic_time(agenda.monday, time(9))
    with pytest.raises(DBAPIError, match="ck_appointment_range"):
        await _raw_insert(
            engine,
            patient=agenda.patients[0]["id"],
            doctor=str(agenda.doctor.id),
            start=start,
            end=start - timedelta(minutes=5),
        )


# --------------------------------------------------------------------- series
async def test_series_creates_sessions_at_the_same_local_time_with_one_series_id(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    response = await agenda.client.post(
        "/appointments/series",
        json={
            "patient_id": agenda.patients[0]["id"],
            "doctor_user_id": str(agenda.doctor.id),
            "specialty": "ACUPUNCTURE",
            "starts_at": iso(agenda.monday, 9),
            "appointment_type_id": agenda.type_id,
            "count": 4,
            "interval_days": 7,
        },
        headers=agenda.reception,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    sessions = body["appointments"]
    assert len(sessions) == 4
    assert {a["series_id"] for a in sessions} == {body["series_id"]}
    local_days = [
        datetime.fromisoformat(a["starts_at"]).astimezone(
            at_clinic_time(agenda.monday, time(9)).tzinfo
        )
        for a in sessions
    ]
    assert [(d.hour) for d in sorted(local_days)] == [14] * 4  # 09:00 Lima = 14:00 UTC, siempre
    assert [
        (b - a).days for a, b in zip(sorted(local_days), sorted(local_days)[1:], strict=False)
    ] == [7, 7, 7]

    listed = await agenda.client.get(
        f"/appointments/series/{body['series_id']}", headers=agenda.reception
    )
    assert len(listed.json()) == 4
    created_audit = [
        r for r in await audit_rows(engine, "CREATE") if r["resource_type"] == "appointment"
    ]
    assert [r["reason"] for r in created_audit] == ["serie de 4 sesiones"]  # un solo registro


def _series_body(agenda: Agenda, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "patient_id": agenda.patients[0]["id"],
        "doctor_user_id": str(agenda.doctor.id),
        "specialty": "ACUPUNCTURE",
        "starts_at": iso(agenda.monday, 9),
        "appointment_type_id": agenda.type_id,
        "count": 4,
        "interval_days": 7,
    }
    body.update(overrides)
    return body


async def test_series_is_all_or_nothing_and_lists_every_problematic_session(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    second = agenda.monday + timedelta(days=7)
    third = agenda.monday + timedelta(days=14)
    await agenda.client.post(  # sesión 2 cae en vacaciones del doctor
        "/schedule-exceptions",
        json={
            "doctor_user_id": str(agenda.doctor.id),
            "start_date": str(second),
            "end_date": str(second),
            "reason": "Vacaciones",
        },
        headers=agenda.owner,
    )
    await agenda.ok(9, day=third, patient=1)  # sesión 3 choca con otra cita

    response = await agenda.client.post(
        "/appointments/series", json=_series_body(agenda), headers=agenda.reception
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "series_invalid"
    problems = {s["session"]: s["code"] for s in error["details"]["sessions"]}
    assert problems == {
        2: "doctor_unavailable",
        3: "appointment_overlap",
    }  # TODAS, no solo la primera

    async with engine.connect() as conn:
        total = (await conn.execute(text("SELECT count(*) FROM appointments"))).scalar_one()
    assert total == 1  # solo la cita previa: ninguna sesión de la serie quedó guardada


@pytest.mark.parametrize("count", [1, 0, 21])
async def test_series_size_limits(agenda: Agenda, count: int) -> None:
    response = await agenda.client.post(
        "/appointments/series", json=_series_body(agenda, count=count), headers=agenda.reception
    )
    assert response.status_code == 422


async def test_series_requires_manage_permission(agenda: Agenda) -> None:
    response = await agenda.client.post(
        "/appointments/series", json=_series_body(agenda), headers=agenda.doctor_headers
    )
    assert response.status_code == 403


# -------------------------------------------------------------- reprogramar
async def test_reschedule_moves_the_appointment_frees_the_old_slot_and_needs_reconfirmation(
    agenda: Agenda,
) -> None:
    created = await agenda.ok(9, room_id=agenda.room_id)
    await agenda.client.post(f"/appointments/{created['id']}/confirm", headers=agenda.reception)

    moved = await agenda.client.post(
        f"/appointments/{created['id']}/reschedule",
        json={"starts_at": iso(agenda.monday, 11)},
        headers=agenda.reception,
    )
    assert moved.status_code == 200, moved.text
    body = moved.json()
    assert body["status"] == "SCHEDULED"  # había que volver a confirmar
    assert body["starts_at"] == datetime.fromisoformat(iso(agenda.monday, 11)).isoformat().replace(
        "+00:00", "Z"
    )
    assert datetime.fromisoformat(body["ends_at"]) - datetime.fromisoformat(
        body["starts_at"]
    ) == timedelta(hours=1)
    assert body["room_name"] == "Consultorio 1"  # la sala se conserva si no se envía
    assert (
        await agenda.book(9, patient=1, room_id=agenda.room_id)
    ).status_code == 201  # hueco libre


async def test_reschedule_onto_an_occupied_slot_fails_and_leaves_the_appointment_untouched(
    agenda: Agenda,
) -> None:
    mine = await agenda.ok(9)
    await agenda.ok(11, patient=1)
    response = await agenda.client.post(
        f"/appointments/{mine['id']}/reschedule",
        json={"starts_at": iso(agenda.monday, 11)},
        headers=agenda.reception,
    )
    assert response.status_code == 409
    unchanged = (
        await agenda.client.get(f"/appointments/{mine['id']}", headers=agenda.reception)
    ).json()
    assert unchanged["starts_at"] == mine["starts_at"]


async def test_reschedule_can_overlap_its_own_previous_slot(agenda: Agenda) -> None:
    mine = await agenda.ok(9)  # 09:00-10:00
    response = await agenda.client.post(
        f"/appointments/{mine['id']}/reschedule",
        json={"starts_at": iso(agenda.monday, 9, 30)},
        headers=agenda.reception,
    )  # 09:30-10:30 pisa su propio horario anterior: debe permitirse
    assert response.status_code == 200


async def test_reschedule_respects_working_hours_and_exceptions(agenda: Agenda) -> None:
    mine = await agenda.ok(9)
    outside = await agenda.client.post(
        f"/appointments/{mine['id']}/reschedule",
        json={"starts_at": iso(agenda.monday, 14)},
        headers=agenda.reception,
    )
    assert outside.json()["error"]["code"] == "outside_working_hours"
    past = await agenda.client.post(
        f"/appointments/{mine['id']}/reschedule",
        json={"starts_at": iso(lima_today() - timedelta(days=2), 9)},
        headers=agenda.reception,
    )
    assert past.json()["error"]["code"] == "appointment_in_past"


async def test_reschedule_can_change_doctor_and_remove_the_room(agenda: Agenda) -> None:
    other = await agenda.new_doctor("otra@clinica-demo.pe")
    mine = await agenda.ok(9, room_id=agenda.room_id)
    moved = await agenda.client.post(
        f"/appointments/{mine['id']}/reschedule",
        json={"starts_at": iso(agenda.monday, 9), "doctor_user_id": str(other.id), "room_id": None},
        headers=agenda.reception,
    )
    body = moved.json()
    assert body["doctor_name"] == "Usuario de Prueba" and body["room_id"] is None
    # El nuevo doctor ya puede ver al paciente.
    assert (
        await agenda.client.get(
            f"/patients/{agenda.patients[0]['id']}", headers=await _login(agenda, other)
        )
    ).status_code == 200


async def _login(agenda: Agenda, user: Any) -> dict[str, str]:
    from tests.helpers import login

    return await login(agenda.client, user.email)


@pytest.mark.parametrize("terminal", ["CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
async def test_only_scheduled_or_confirmed_appointments_can_be_rescheduled(
    agenda: Agenda, terminal: str
) -> None:
    created = await agenda.ok(9)
    async with agenda.session_factory() as session:
        await session.execute(
            text("UPDATE appointments SET status = :s WHERE id = :i"),
            {"s": terminal, "i": created["id"]},
        )
        await session.commit()
    response = await agenda.client.post(
        f"/appointments/{created['id']}/reschedule",
        json={"starts_at": iso(agenda.monday, 11)},
        headers=agenda.reception,
    )
    assert response.status_code == 422 and response.json()["error"]["code"] == "not_reschedulable"


# --------------------------------------------------------------------- estados
async def _today_appointment(
    agenda: Agenda, status: str = "SCHEDULED", hours_from_now: float = 1
) -> dict[str, Any]:
    """Cita de HOY insertada directamente (la API no agenda en el pasado ni fuera de horario)."""
    start = utcnow() + timedelta(hours=hours_from_now)
    row = await insert_appointment(
        agenda.session_factory,
        patient_id=agenda.patients[0]["id"],
        doctor_id=str(agenda.doctor.id),
        starts_at=start,
        status=status,
    )
    return {"id": str(row.id), "starts_at": start}


@pytest.mark.skipif(
    lima_today()
    != (utcnow() + timedelta(hours=1))
    .astimezone(at_clinic_time(lima_today(), time(0)).tzinfo)
    .date(),
    reason="a esta hora, 'dentro de 1 hora' ya cae en el día siguiente de Lima",
)
async def test_full_day_flow_confirm_check_in_start_complete(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    appointment = await _today_appointment(agenda)
    url = f"/appointments/{appointment['id']}"

    confirmed = await agenda.client.post(f"{url}/confirm", headers=agenda.reception)
    assert confirmed.json()["status"] == "CONFIRMED"
    arrived = (await agenda.client.post(f"{url}/check-in", headers=agenda.reception)).json()
    assert arrived["status"] == "CHECKED_IN" and arrived["checked_in_at"] is not None
    started = await agenda.client.post(f"{url}/start", headers=agenda.doctor_headers)
    assert started.json()["status"] == "IN_PROGRESS"
    done = await agenda.client.post(f"{url}/complete", headers=agenda.doctor_headers)
    assert done.json()["status"] == "COMPLETED"

    reasons = [
        r["reason"]
        for r in await audit_rows(engine, "UPDATE")
        if r["resource_type"] == "appointment"
    ]
    assert reasons == [
        "estado=CONFIRMED",
        "estado=CHECKED_IN",
        "estado=IN_PROGRESS",
        "estado=COMPLETED",
    ]


async def test_check_in_is_only_allowed_on_the_day_of_the_appointment(agenda: Agenda) -> None:
    future = await agenda.ok(9)
    response = await agenda.client.post(
        f"/appointments/{future['id']}/check-in", headers=agenda.reception
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "check_in_wrong_day"
    unchanged = (
        await agenda.client.get(f"/appointments/{future['id']}", headers=agenda.reception)
    ).json()
    assert unchanged["status"] == "SCHEDULED" and unchanged["checked_in_at"] is None


@pytest.mark.parametrize(
    ("action", "from_status"),
    [
        ("start", "SCHEDULED"),  # no se atiende sin check-in
        ("start", "CONFIRMED"),
        ("complete", "CHECKED_IN"),  # primero debe iniciarse
        ("complete", "SCHEDULED"),
        ("confirm", "CHECKED_IN"),
        ("confirm", "COMPLETED"),
    ],
)
async def test_illegal_transitions_are_rejected_with_a_clear_code(
    agenda: Agenda, action: str, from_status: str
) -> None:
    appointment = await _today_appointment(agenda, status=from_status)
    headers = agenda.doctor_headers if action in {"start", "complete"} else agenda.reception
    response = await agenda.client.post(
        f"/appointments/{appointment['id']}/{action}", headers=headers
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_appointment_transition"


async def test_only_the_appointments_own_doctor_can_start_or_complete_it(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    other = await agenda.new_doctor("otra@clinica-demo.pe")
    other_headers = await _login(agenda, other)
    appointment = await _today_appointment(agenda, status="CHECKED_IN")

    denied = await agenda.client.post(
        f"/appointments/{appointment['id']}/start", headers=other_headers
    )
    assert denied.status_code == 403
    reception = await agenda.client.post(
        f"/appointments/{appointment['id']}/start", headers=agenda.reception
    )
    assert reception.status_code == 403  # recepción no atiende
    rows = await audit_rows(engine, "PERMISSION_DENIED")
    assert any(r["reason"] == "atención de otro doctor" for r in rows)
    assert (
        await agenda.client.post(
            f"/appointments/{appointment['id']}/start", headers=agenda.doctor_headers
        )
    ).status_code == 200


async def test_cancel_requires_a_reason_and_stores_it(agenda: Agenda) -> None:
    created = await agenda.ok(9)
    url = f"/appointments/{created['id']}/cancel"
    for body in ({}, {"reason": ""}, {"reason": "x" * 201}):
        assert (
            await agenda.client.post(url, json=body, headers=agenda.reception)
        ).status_code == 422
    cancelled = (
        await agenda.client.post(url, json={"reason": "Paciente enfermo"}, headers=agenda.reception)
    ).json()
    assert cancelled["status"] == "CANCELLED" and cancelled["cancel_reason"] == "Paciente enfermo"
    again = await agenda.client.post(url, json={"reason": "otra vez"}, headers=agenda.reception)
    assert again.status_code == 422  # terminal
    still = (
        await agenda.client.get(f"/appointments/{created['id']}", headers=agenda.reception)
    ).json()
    assert still["cancel_reason"] == "Paciente enfermo"  # el segundo intento no lo pisó


async def test_an_appointment_in_progress_cannot_be_cancelled(agenda: Agenda) -> None:
    appointment = await _today_appointment(agenda, status="IN_PROGRESS")
    response = await agenda.client.post(
        f"/appointments/{appointment['id']}/cancel", json={"reason": "x"}, headers=agenda.reception
    )
    assert response.status_code == 422


async def test_no_show_only_after_the_start_time(agenda: Agenda) -> None:
    future = await agenda.ok(9)
    early = await agenda.client.post(
        f"/appointments/{future['id']}/no-show", headers=agenda.reception
    )
    assert early.status_code == 422 and early.json()["error"]["code"] == "no_show_too_early"

    past = await _today_appointment(agenda, hours_from_now=-2)
    marked = await agenda.client.post(
        f"/appointments/{past['id']}/no-show", headers=agenda.reception
    )
    assert marked.status_code == 200 and marked.json()["status"] == "NO_SHOW"


async def test_unknown_appointment_is_404(agenda: Agenda) -> None:
    missing = "00000000-0000-0000-0000-000000000000"
    assert (
        await agenda.client.get(f"/appointments/{missing}", headers=agenda.reception)
    ).status_code == 404
    assert (
        await agenda.client.post(f"/appointments/{missing}/confirm", headers=agenda.reception)
    ).status_code == 404


# ------------------------------------------------------------ visibilidad
async def test_doctor_only_sees_their_own_appointments_whatever_filter_they_send(
    agenda: Agenda,
) -> None:
    other = await agenda.new_doctor("otra@clinica-demo.pe")
    mine = await agenda.ok(9)
    theirs = await agenda.ok(9, patient=1, doctor=other)

    listed = (await agenda.client.get("/appointments", headers=agenda.doctor_headers)).json()
    assert [a["id"] for a in listed] == [mine["id"]]
    forced = (
        await agenda.client.get(
            "/appointments", params={"doctor_id": str(other.id)}, headers=agenda.doctor_headers
        )
    ).json()
    assert [a["id"] for a in forced] == [mine["id"]]  # el filtro ajeno se ignora

    denied = await agenda.client.get(f"/appointments/{theirs['id']}", headers=agenda.doctor_headers)
    assert denied.status_code == 403
    assert (
        await agenda.client.get(f"/appointments/{mine['id']}", headers=agenda.doctor_headers)
    ).status_code == 200


async def test_owner_who_is_also_doctor_sees_every_appointment(
    agenda: Agenda, session_factory: Any
) -> None:
    from tests.helpers import create_user, login

    await create_user(session_factory, "duena@clinica-demo.pe", [Role.OWNER, Role.DOCTOR])
    headers = await login(agenda.client, "duena@clinica-demo.pe")
    await agenda.ok(9)
    await agenda.ok(10, patient=1)
    assert len((await agenda.client.get("/appointments", headers=headers)).json()) == 2


async def test_doctor_cannot_read_another_doctors_series(agenda: Agenda) -> None:
    other = await agenda.new_doctor("otra@clinica-demo.pe")
    series = (
        await agenda.client.post(
            "/appointments/series",
            json=_series_body(agenda, doctor_user_id=str(other.id), count=2),
            headers=agenda.reception,
        )
    ).json()
    response = await agenda.client.get(
        f"/appointments/series/{series['series_id']}", headers=agenda.doctor_headers
    )
    assert response.status_code == 403


async def test_list_filters_and_range_semantics(agenda: Agenda) -> None:
    other = await agenda.new_doctor("otra@clinica-demo.pe")
    a = await agenda.ok(9, room_id=agenda.room_id)
    b = await agenda.ok(10, patient=1, doctor=other)
    c = await agenda.ok(9, day=agenda.monday + timedelta(days=1), patient=2)
    await agenda.client.post(
        f"/appointments/{c['id']}/cancel", json={"reason": "x"}, headers=agenda.reception
    )

    async def ids(**params: Any) -> list[str]:
        rows = (
            await agenda.client.get("/appointments", params=params, headers=agenda.reception)
        ).json()
        return [r["id"] for r in rows]

    day = agenda.monday
    start, end = iso(day, 0), iso(day + timedelta(days=1), 0)
    assert await ids(**{"from": start, "to": end}) == [a["id"], b["id"]]  # ordenadas por inicio
    assert await ids(doctor_id=str(other.id)) == [b["id"]]
    assert await ids(patient_id=agenda.patients[2]["id"]) == [c["id"]]
    assert await ids(status="CANCELLED") == [c["id"]]
    assert await ids(room_id=agenda.room_id) == [a["id"]]
    assert await ids(specialty="NUTRITION") == []
    # Una cita que se solapa con el rango entra aunque empiece antes (09:00-10:00 vs desde 09:30).
    assert a["id"] in await ids(**{"from": iso(day, 9, 30), "to": end})
    assert a["id"] not in await ids(**{"from": iso(day, 10), "to": end})  # termina justo en 10:00


async def test_reading_one_appointment_is_audited_with_the_patient_id(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    created = await agenda.ok(9)
    await agenda.client.get(f"/appointments/{created['id']}", headers=agenda.reception)
    reads = await audit_rows(engine, "READ")
    assert len(reads) == 1 and reads[0]["resource_type"] == "appointment"
    assert str(reads[0]["patient_id"]) == agenda.patients[0]["id"]


async def test_audit_of_appointments_never_stores_personal_data_or_notes(
    agenda: Agenda, engine: AsyncEngine
) -> None:
    created = await agenda.ok(9, admin_notes="Nota confidencial XYZ")
    await agenda.client.post(f"/appointments/{created['id']}/confirm", headers=agenda.reception)
    await agenda.client.post(
        f"/appointments/{created['id']}/cancel",
        json={"reason": "Motivo secreto 123"},
        headers=agenda.reception,
    )
    dump = str(await audit_rows(engine))
    for secret in ("Nota confidencial", "Motivo secreto", "Ana", "Gómez", "Dra. Acu"):
        assert secret not in dump


# ---------------------------------------------------------- disponibilidad
async def _availability(agenda: Agenda, **params: Any) -> Any:
    defaults: dict[str, str | int] = {
        "from_date": str(agenda.monday),
        "to_date": str(agenda.monday),
        "duration_minutes": 60,
    }
    return await agenda.client.get(
        "/appointments/availability", params={**defaults, **params}, headers=agenda.reception
    )


async def test_availability_lists_aligned_slots_in_local_time(agenda: Agenda) -> None:
    response = await _availability(agenda, doctor_id=str(agenda.doctor.id), duration_minutes=60)
    slots = response.json()[0]["slots"]
    starts = [s["starts_at"] for s in slots]
    # Mañana 09:00-13:00 → 09:00 … 12:00 (7); tarde 15:00-19:00 → 15:00 … 18:00 (7).
    assert len(slots) == 14
    assert starts[0] == iso(agenda.monday, 9).replace("+00:00", "Z")  # 09:00 Lima = 14:00 UTC

    def utc(hour: int, minute: int = 0) -> str:
        return iso(agenda.monday, hour, minute).replace("+00:00", "Z")

    assert utc(13) not in starts  # el almuerzo no se ofrece
    assert utc(12, 30) not in starts  # 12:30 + 60 min terminaría a las 13:30: no cabe
    assert utc(12) in starts and utc(15) in starts and utc(18) in starts
    assert utc(19) not in starts  # después de cerrar


async def test_availability_excludes_busy_time_and_returns_after_cancelling(agenda: Agenda) -> None:
    booked = await agenda.ok(10)  # 10:00-11:00
    params = {"doctor_id": str(agenda.doctor.id), "duration_minutes": 30}
    slots = [s["starts_at"] for s in (await _availability(agenda, **params)).json()[0]["slots"]]
    busy = [iso(agenda.monday, 10), iso(agenda.monday, 10, 30)]
    assert not any(b.replace("+00:00", "Z") in slots for b in busy)
    assert (
        iso(agenda.monday, 9, 30).replace("+00:00", "Z") in slots
    )  # termina justo al empezar la cita
    assert iso(agenda.monday, 11).replace("+00:00", "Z") in slots

    await agenda.client.post(
        f"/appointments/{booked['id']}/cancel", json={"reason": "x"}, headers=agenda.reception
    )
    again = [s["starts_at"] for s in (await _availability(agenda, **params)).json()[0]["slots"]]
    assert iso(agenda.monday, 10).replace("+00:00", "Z") in again


async def test_every_slot_offered_by_availability_can_actually_be_booked(agenda: Agenda) -> None:
    """Coherencia entre lo que se ofrece y lo que se acepta."""
    slots = (await _availability(agenda, doctor_id=str(agenda.doctor.id))).json()[0]["slots"]
    chosen = [slots[0], slots[3], slots[8], slots[-1]]
    for index, slot in enumerate(chosen):
        response = await agenda.client.post(
            "/appointments",
            json={
                "patient_id": agenda.patients[index % 3]["id"],
                "doctor_user_id": str(agenda.doctor.id),
                "specialty": "ACUPUNCTURE",
                "starts_at": slot["starts_at"],
                "duration_minutes": 60,
            },
            headers=agenda.reception,
        )
        assert response.status_code == 201, (slot, response.text)


async def test_availability_by_specialty_includes_only_doctors_who_offer_it(agenda: Agenda) -> None:
    await agenda.new_doctor("acu2@clinica-demo.pe", {Specialty.ACUPUNCTURE})
    await agenda.new_doctor("nutri@clinica-demo.pe", {Specialty.NUTRITION})
    result = (await _availability(agenda, specialty="ACUPUNCTURE")).json()
    assert len(result) == 2  # la doctora de acupuntura y el otro de acupuntura
    assert all(d["doctor_name"] and d["slots"] for d in result)
    nutrition = (await _availability(agenda, specialty="NUTRITION")).json()
    assert len(nutrition) == 1


async def test_availability_skips_exception_days_and_uses_the_type_duration(agenda: Agenda) -> None:
    await agenda.client.post(
        "/schedule-exceptions",
        json={
            "start_date": str(agenda.monday),
            "end_date": str(agenda.monday),
            "reason": "Feriado",
        },
        headers=agenda.owner,
    )
    tuesday = agenda.monday + timedelta(days=1)
    result = await agenda.client.get(
        "/appointments/availability",
        params={
            "doctor_id": str(agenda.doctor.id),
            "from_date": str(agenda.monday),
            "to_date": str(tuesday),
            "appointment_type_id": agenda.type_id,  # 60 min por tipo, sin duration_minutes
        },
        headers=agenda.reception,
    )
    slots = result.json()[0]["slots"]
    assert slots and all(
        datetime.fromisoformat(s["ends_at"]) - datetime.fromisoformat(s["starts_at"])
        == timedelta(hours=1)
        for s in slots
    )
    local_days = {
        datetime.fromisoformat(s["starts_at"])
        .astimezone(at_clinic_time(tuesday, time(0)).tzinfo)
        .date()
        for s in slots
    }
    assert local_days == {tuesday}  # el lunes feriado no ofrece nada


@pytest.mark.parametrize(
    "params",
    [
        {"from_date": "2030-01-01", "to_date": "2030-01-20"},  # 20 días > máximo 14
        {"from_date": "2030-01-05", "to_date": "2030-01-01"},  # invertido
        {},  # sin doctor ni especialidad
    ],
)
async def test_invalid_availability_queries_are_rejected(
    agenda: Agenda, params: dict[str, str]
) -> None:
    query: dict[str, str | int] = {"duration_minutes": 30, **params}
    if "from_date" not in query:
        query.update({"from_date": str(agenda.monday), "to_date": str(agenda.monday)})
    response = await agenda.client.get(
        "/appointments/availability", params=query, headers=agenda.reception
    )
    assert response.status_code == 422


async def test_availability_requires_a_duration_or_a_type_and_manage_permission(
    agenda: Agenda,
) -> None:
    base = {
        "doctor_id": str(agenda.doctor.id),
        "from_date": str(agenda.monday),
        "to_date": str(agenda.monday),
    }
    no_duration = await agenda.client.get(
        "/appointments/availability", params=base, headers=agenda.reception
    )
    assert (
        no_duration.status_code == 422
        and no_duration.json()["error"]["code"] == "duration_required"
    )
    as_doctor = await agenda.client.get(
        "/appointments/availability",
        params={**base, "duration_minutes": 30},
        headers=agenda.doctor_headers,
    )
    assert as_doctor.status_code == 403


async def test_availability_never_offers_past_slots(agenda: Agenda) -> None:
    today = lima_today()
    result = await agenda.client.get(
        "/appointments/availability",
        params={
            "doctor_id": str(agenda.doctor.id),
            "from_date": str(today),
            "to_date": str(today),
            "duration_minutes": 30,
        },
        headers=agenda.reception,
    )
    now = datetime.now(UTC)
    assert all(datetime.fromisoformat(s["starts_at"]) >= now for s in result.json()[0]["slots"])
