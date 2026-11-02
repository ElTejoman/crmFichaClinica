"""CRM: permisos, embudo, actividades, seguimientos, conversión atómica y estadísticas."""

from collections.abc import Awaitable, Callable
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.clock import lima_end_of_today, utcnow
from app.domain.enums import Role
from tests.helpers import SessionFactory, create_user, lead_payload, login, patient_payload

AsRole = Callable[..., Awaitable[dict[str, str]]]


async def _create(client: AsyncClient, headers: dict[str, str], **overrides: object) -> dict:  # type: ignore[type-arg]
    response = await client.post("/leads", json=lead_payload(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


async def _count(engine: AsyncEngine, table: str) -> int:
    async with engine.connect() as conn:
        return int((await conn.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one())  # noqa: S608


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
async def test_create_lead_permission_matrix(
    client: AsyncClient, as_role: AsRole, role: Role, expected: int
) -> None:
    response = await client.post("/leads", json=lead_payload(), headers=await as_role(role))
    assert response.status_code == expected


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        (Role.OWNER, 200),
        (Role.SUPERUSER, 403),
        (Role.RECEPTION, 403),
        (Role.DOCTOR, 403),
        (Role.PATIENT, 403),
    ],
)
async def test_only_owner_sees_lead_statistics(
    client: AsyncClient, as_role: AsRole, role: Role, expected: int
) -> None:
    assert (await client.get("/leads/stats", headers=await as_role(role))).status_code == expected


async def test_patient_role_cannot_read_leads(client: AsyncClient, as_role: AsRole) -> None:
    assert (await client.get("/leads", headers=await as_role(Role.PATIENT))).status_code == 403


# --------------------------------------------------------------------- alta
async def test_new_lead_defaults_and_normalization(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(
        client,
        headers,
        phone="912 345 678",
        email="Pedro@Gmail.COM",
        interest_specialties=["DENTISTRY", "NUTRITION"],
    )
    assert lead["status"] == "NEW"
    assert lead["phone"] == "+51912345678" and lead["email"] == "pedro@gmail.com"
    assert lead["interest_specialties"] == ["DENTISTRY", "NUTRITION"]
    assert lead["consent_marketing"] is False and lead["activities"] == []


async def test_lead_needs_a_contact_channel(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    payload = lead_payload()
    del payload["phone"]
    assert (await client.post("/leads", json=payload, headers=headers)).status_code == 422


async def test_duplicate_phone_among_leads_is_flagged_and_can_be_forced(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    original = await _create(client, headers, phone="911222333")
    again = await client.post("/leads", json=lead_payload(phone="911 222 333"), headers=headers)
    assert again.status_code == 409
    details = again.json()["error"]["details"]
    assert details["code"] == "possible_duplicate"
    assert details["leads"][0]["id"] == original["id"]

    forced = await client.post(
        "/leads",
        params={"allow_duplicate": True},
        json=lead_payload(phone="911222333"),
        headers=headers,
    )
    assert forced.status_code == 201


async def test_lead_matching_an_existing_patient_is_flagged(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    patient = (
        await client.post(
            "/patients",
            json=patient_payload(phone="955444333", email="ya@paciente.pe"),
            headers=headers,
        )
    ).json()
    by_phone = await client.post("/leads", json=lead_payload(phone="955444333"), headers=headers)
    by_email = await client.post(
        "/leads", json=lead_payload(phone="900000001", email="YA@paciente.pe"), headers=headers
    )
    for response in (by_phone, by_email):
        assert response.status_code == 409
        assert response.json()["error"]["details"]["patients"][0]["id"] == patient["id"]


async def test_assignee_must_be_active_clinic_staff(
    client: AsyncClient, as_role: AsRole, session_factory: SessionFactory
) -> None:
    headers = await as_role(Role.RECEPTION)
    patient_user = await create_user(session_factory, "pac@clinica-demo.pe", [Role.PATIENT])
    inactive = await create_user(
        session_factory, "baja@clinica-demo.pe", [Role.DOCTOR], is_active=False
    )
    doctor = await create_user(session_factory, "doc@clinica-demo.pe", [Role.DOCTOR])

    for bad in (patient_user.id, inactive.id):
        response = await client.post(
            "/leads", json=lead_payload(assigned_to=str(bad)), headers=headers
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_assignee"
    ok = await client.post("/leads", json=lead_payload(assigned_to=str(doctor.id)), headers=headers)
    assert ok.status_code == 201 and ok.json()["assigned_to"] == str(doctor.id)


# ------------------------------------------------------------------- embudo
async def _patch(client: AsyncClient, headers: dict[str, str], lead_id: str, **body: object):  # type: ignore[no-untyped-def]
    return await client.patch(f"/leads/{lead_id}", json=body, headers=headers)


async def test_open_stages_move_freely_forward_and_backward(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    for stage in ("QUALIFIED", "APPOINTMENT_SET", "CONTACTED", "NEW"):
        response = await _patch(client, headers, lead["id"], status=stage)
        assert response.status_code == 200 and response.json()["status"] == stage


async def test_each_status_change_leaves_an_activity_trail(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    await _patch(client, headers, lead["id"], status="QUALIFIED")
    updated = (await _patch(client, headers, lead["id"], status="CONTACTED")).json()
    trail = [(a["type"], a["notes"]) for a in updated["activities"]]
    assert trail == [
        ("STATUS_CHANGE", "QUALIFIED → CONTACTED"),
        ("STATUS_CHANGE", "NEW → QUALIFIED"),
    ]


async def test_lost_requires_reason_and_can_only_reopen_as_new(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)

    no_reason = await _patch(client, headers, lead["id"], status="LOST")
    assert no_reason.status_code == 422
    assert no_reason.json()["error"]["code"] == "invalid_lead_transition"

    lost = (await _patch(client, headers, lead["id"], status="LOST", lost_reason="Precio")).json()
    assert lost["status"] == "LOST" and lost["lost_reason"] == "Precio"

    illegal = await _patch(client, headers, lead["id"], status="QUALIFIED")
    assert illegal.status_code == 422

    reopened = (await _patch(client, headers, lead["id"], status="NEW")).json()
    assert reopened["status"] == "NEW" and reopened["lost_reason"] is None


async def test_converted_cannot_be_set_manually(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    response = await _patch(client, headers, lead["id"], status="CONVERTED")
    assert response.status_code == 422
    assert "Convertir" in response.json()["error"]["message"]


async def test_patch_updates_only_sent_fields_and_null_clears(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers, email="a@b.pe", notes="Interesada en bajar de peso")
    updated = (
        await _patch(client, headers, lead["id"], email=None, interest_specialties=["ACUPUNCTURE"])
    ).json()
    assert updated["email"] is None
    assert updated["interest_specialties"] == ["ACUPUNCTURE"]
    assert updated["notes"] == "Interesada en bajar de peso"  # intacto


# ------------------------------------------------------------- actividades
async def test_first_contact_moves_new_lead_to_contacted_but_a_note_does_not(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    noted = await _create(client, headers)
    after_note = await client.post(
        f"/leads/{noted['id']}/activities",
        json={"type": "NOTE", "notes": "Pidió precios"},
        headers=headers,
    )
    assert after_note.status_code == 201 and after_note.json()["status"] == "NEW"

    called = await _create(client, headers)
    after_call = (
        await client.post(
            f"/leads/{called['id']}/activities",
            json={"type": "CALL", "notes": "Contestó"},
            headers=headers,
        )
    ).json()
    assert after_call["status"] == "CONTACTED"
    kinds = [a["type"] for a in after_call["activities"]]
    assert kinds == ["STATUS_CHANGE", "CALL"]


async def test_activity_sets_and_clears_next_action(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    when = (utcnow() + timedelta(days=2)).isoformat()
    with_next = (
        await client.post(
            f"/leads/{lead['id']}/activities",
            json={"type": "WHATSAPP", "next_action_at": when},
            headers=headers,
        )
    ).json()
    assert with_next["next_action_at"] is not None
    cleared = (
        await client.post(
            f"/leads/{lead['id']}/activities",
            json={"type": "CALL", "notes": "Listo"},
            headers=headers,
        )
    ).json()
    assert cleared["next_action_at"] is None


@pytest.mark.parametrize(
    "body",
    [
        {"type": "STATUS_CHANGE"},  # reservado al sistema
        {"type": "CALL", "next_action_at": "2030-01-01T10:00:00"},  # sin zona horaria
        {"type": "CALL", "notes": "x" * 1001},
        {"type": "VISIT"},
    ],
)
async def test_invalid_activities_are_rejected(
    client: AsyncClient, as_role: AsRole, body: dict[str, object]
) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    response = await client.post(f"/leads/{lead['id']}/activities", json=body, headers=headers)
    assert response.status_code == 422


# ------------------------------------------------------------ seguimientos
async def test_followups_include_due_today_and_overdue_but_not_future_or_closed(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    end_of_today = lima_end_of_today()

    async def with_next(name: str, when: object) -> dict:  # type: ignore[type-arg]
        lead = await _create(client, headers, full_name=name)
        await client.post(
            f"/leads/{lead['id']}/activities",
            json={"type": "NOTE", "next_action_at": when.isoformat()},  # type: ignore[attr-defined]
            headers=headers,
        )
        return lead

    await with_next("Vencido ayer", utcnow() - timedelta(days=1))
    await with_next("Hoy al cierre", end_of_today - timedelta(minutes=1))
    await with_next("Mañana", end_of_today + timedelta(hours=1))
    lost = await with_next("Perdido", utcnow() - timedelta(days=1))
    await _patch(client, headers, lost["id"], status="LOST", lost_reason="No contesta")

    due = (await client.get("/leads/followups", headers=headers)).json()
    assert [d["full_name"] for d in due] == ["Vencido ayer", "Hoy al cierre"]  # más antiguo primero


# -------------------------------------------------------- cartera del doctor
async def test_doctor_only_sees_leads_assigned_to_them(
    client: AsyncClient, as_role: AsRole, session_factory: SessionFactory, engine: AsyncEngine
) -> None:
    reception = await as_role(Role.RECEPTION)
    doctor = await create_user(session_factory, "doc@clinica-demo.pe", [Role.DOCTOR])
    doctor_headers = await login(client, "doc@clinica-demo.pe")
    mine = await _create(client, reception, full_name="Mío", assigned_to=str(doctor.id))
    other = await _create(client, reception, full_name="Ajeno")

    listed = (await client.get("/leads", headers=doctor_headers)).json()
    assert [x["full_name"] for x in listed] == ["Mío"]
    assert (await client.get(f"/leads/{mine['id']}", headers=doctor_headers)).status_code == 200

    denied = await client.get(f"/leads/{other['id']}", headers=doctor_headers)
    assert denied.status_code == 403
    async with engine.connect() as conn:
        reasons = [
            r[0]
            for r in await conn.execute(
                text("SELECT reason FROM audit_logs WHERE action='PERMISSION_DENIED'")
            )
        ]
    assert "lead no asignado" in reasons
    # y no puede modificar leads
    assert (await _patch(client, doctor_headers, mine["id"], notes="x")).status_code == 403


# ----------------------------------------------------------- búsqueda/filtros
async def test_list_filters_and_accent_insensitive_search(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    await _create(
        client, headers, full_name="José Núñez", source="WEB", interest_specialties=["DENTISTRY"]
    )
    await _create(
        client,
        headers,
        full_name="Ana Pérez",
        source="REFERRAL",
        interest_specialties=["NUTRITION"],
    )
    lead3 = await _create(
        client,
        headers,
        full_name="Luis Ríos",
        source="WEB",
        interest_specialties=["NUTRITION", "ACUPUNCTURE"],
    )
    await _patch(client, headers, lead3["id"], status="QUALIFIED")

    async def names(**params: object) -> list[str]:
        rows = (await client.get("/leads", params=params, headers=headers)).json()  # type: ignore[arg-type]
        return sorted(r["full_name"] for r in rows)

    assert await names(q="jose nunez") == ["José Núñez"]
    assert await names(source="WEB") == ["José Núñez", "Luis Ríos"]
    assert await names(specialty="NUTRITION") == ["Ana Pérez", "Luis Ríos"]
    assert await names(status="QUALIFIED") == ["Luis Ríos"]
    assert await names(q="%") == []


# --------------------------------------------------------------- conversión
async def test_conversion_creates_patient_and_history_and_closes_the_lead(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers, source="INSTAGRAM")
    when = (utcnow() + timedelta(days=1)).isoformat()
    await client.post(
        f"/leads/{lead['id']}/activities",
        json={"type": "CALL", "next_action_at": when},
        headers=headers,
    )

    response = await client.post(
        f"/leads/{lead['id']}/convert", json={"patient": patient_payload()}, headers=headers
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["hc_number"] == 1
    converted = result["lead"]
    assert converted["status"] == "CONVERTED"
    assert converted["converted_patient_id"] == result["patient_id"]
    assert converted["next_action_at"] is None  # un convertido ya no genera seguimientos
    assert converted["activities"][0]["notes"] == "Convertido en paciente"

    patient = (await client.get(f"/patients/{result['patient_id']}", headers=headers)).json()
    assert patient["referral_source"] == "INSTAGRAM"  # la fuente comercial se conserva
    assert patient["hc_code"] == "HC-000001"


async def test_converting_twice_is_a_conflict(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    first = await client.post(
        f"/leads/{lead['id']}/convert", json={"patient": patient_payload()}, headers=headers
    )
    second = await client.post(
        f"/leads/{lead['id']}/convert", json={"patient": patient_payload()}, headers=headers
    )
    assert first.status_code == 200 and second.status_code == 409
    assert await _count(engine, "patients") == 1


async def test_failed_conversion_is_atomic_for_invalid_patient_data(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    """Menor sin apoderado: no se crea paciente NI historia y el lead sigue intacto."""
    from app.core.clock import lima_today
    from app.domain.patient_rules import add_years

    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    minor = patient_payload(birth_date=str(add_years(lima_today(), -9)))
    response = await client.post(
        f"/leads/{lead['id']}/convert", json={"patient": minor}, headers=headers
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "guardian_required"
    assert await _count(engine, "patients") == 0 and await _count(engine, "clinical_histories") == 0
    assert (await client.get(f"/leads/{lead['id']}", headers=headers)).json()["status"] == "NEW"


async def test_conversion_with_existing_document_conflicts_and_leaves_lead_open(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    headers = await as_role(Role.RECEPTION)
    await client.post(
        "/patients", json=patient_payload(document_number="45678912"), headers=headers
    )
    lead = await _create(client, headers)
    response = await client.post(
        f"/leads/{lead['id']}/convert",
        json={"patient": patient_payload(document_number="45678912")},
        headers=headers,
    )
    assert response.status_code == 409
    assert response.json()["error"]["details"]["code"] == "patient_document_exists"
    assert (await client.get(f"/leads/{lead['id']}", headers=headers)).json()["status"] == "NEW"
    assert await _count(engine, "patients") == 1


async def test_lost_lead_can_still_be_converted(client: AsyncClient, as_role: AsRole) -> None:
    """Un lead perdido que cambia de opinión puede convertirse directamente."""
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    await _patch(client, headers, lead["id"], status="LOST", lost_reason="Precio")
    response = await client.post(
        f"/leads/{lead['id']}/convert", json={"patient": patient_payload()}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["lead"]["status"] == "CONVERTED"
    assert response.json()["lead"]["lost_reason"] is None


async def test_converted_lead_rejects_new_activities(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    await client.post(
        f"/leads/{lead['id']}/convert", json={"patient": patient_payload()}, headers=headers
    )
    response = await client.post(
        f"/leads/{lead['id']}/activities", json={"type": "NOTE", "notes": "x"}, headers=headers
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("role", "expected"), [(Role.OWNER, 200), (Role.RECEPTION, 200), (Role.DOCTOR, 403)]
)
async def test_conversion_permissions(
    client: AsyncClient, as_role: AsRole, role: Role, expected: int
) -> None:
    lead = await _create(client, await as_role(Role.RECEPTION))
    response = await client.post(
        f"/leads/{lead['id']}/convert",
        json={"patient": patient_payload()},
        headers=await as_role(role),
    )
    assert response.status_code == expected


async def test_conversion_is_audited_for_both_lead_and_patient(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)
    result = (
        await client.post(
            f"/leads/{lead['id']}/convert", json={"patient": patient_payload()}, headers=headers
        )
    ).json()
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text("SELECT resource_type, action, reason, patient_id FROM audit_logs ORDER BY id")
            )
        ).all()
    kinds = [(r[0], r[1]) for r in rows if r[0] in ("patient", "lead")]
    assert ("patient", "CREATE") in kinds and ("lead", "UPDATE") in kinds
    assert any(r[2] == "convertido a paciente" for r in rows)
    assert any(str(r[3]) == result["patient_id"] for r in rows)


# ------------------------------------------------------------- estadísticas
async def test_statistics_reflect_funnel_sources_and_conversion(
    client: AsyncClient, as_role: AsRole
) -> None:
    reception = await as_role(Role.RECEPTION)
    owner = await as_role(Role.OWNER)
    a = await _create(client, reception, source="WEB", interest_specialties=["NUTRITION"])
    b = await _create(
        client, reception, source="WEB", interest_specialties=["NUTRITION", "DENTISTRY"]
    )
    c = await _create(client, reception, source="REFERRAL", interest_specialties=["ACUPUNCTURE"])
    await _create(client, reception, source="WALK_IN", interest_specialties=[])
    await _patch(client, reception, b["id"], status="LOST", lost_reason="Precio")
    await _patch(client, reception, c["id"], status="LOST", lost_reason="Precio")
    await client.post(
        f"/leads/{a['id']}/convert", json={"patient": patient_payload()}, headers=reception
    )

    stats = (await client.get("/leads/stats", headers=owner)).json()
    assert (stats["total"], stats["open"], stats["converted"], stats["lost"]) == (4, 1, 1, 2)
    assert stats["conversion_rate"] == 0.25
    assert stats["by_source"] == {"WEB": 2, "REFERRAL": 1, "WALK_IN": 1}
    assert stats["by_specialty"] == {"NUTRITION": 2, "DENTISTRY": 1, "ACUPUNCTURE": 1}
    assert stats["lost_reasons"] == {"Precio": 2}


async def test_statistics_with_no_leads_do_not_divide_by_zero(
    client: AsyncClient, as_role: AsRole
) -> None:
    stats = (await client.get("/leads/stats", headers=await as_role(Role.OWNER))).json()
    assert stats["total"] == 0 and stats["conversion_rate"] == 0.0


async def test_conversion_rolls_back_the_patient_if_a_later_step_fails(
    client: AsyncClient,
    as_role: AsRole,
    engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Fallo TARDÍO (después de crear paciente e historia): todo debe deshacerse.

    Los otros tests de atomicidad fallan antes de cualquier commit; este es el que detecta
    un commit prematuro dentro de la conversión.
    """
    from app.repositories.leads import LeadRepository

    headers = await as_role(Role.RECEPTION)
    lead = await _create(client, headers)

    async def explode(*args: object, **kwargs: object) -> None:
        raise RuntimeError("fallo simulado tras crear el paciente")

    monkeypatch.setattr(LeadRepository, "add_activity", explode)
    with pytest.raises(RuntimeError, match="simulado"):
        await client.post(
            f"/leads/{lead['id']}/convert", json={"patient": patient_payload()}, headers=headers
        )
    monkeypatch.undo()

    assert await _count(engine, "patients") == 0
    assert await _count(engine, "clinical_histories") == 0
    assert (await client.get(f"/leads/{lead['id']}", headers=headers)).json()["status"] == "NEW"


async def test_lead_summary_includes_assignee_name_and_lost_reason(
    client: AsyncClient, as_role: AsRole, session_factory: SessionFactory
) -> None:
    """El tablero muestra el responsable (cualquier personal) y el motivo en 'Perdidos'."""
    headers = await as_role(Role.RECEPTION)
    desk = await create_user(
        session_factory, "otra.recep@clinica-demo.pe", [Role.RECEPTION], full_name="Marisol Rojas"
    )
    lead = await _create(client, headers, assigned_to=str(desk.id))
    unassigned = await _create(client, headers)
    await _patch(client, headers, lead["id"], status="LOST", lost_reason="Precio")

    rows = {r["id"]: r for r in (await client.get("/leads", headers=headers)).json()}
    assert rows[lead["id"]]["assigned_to_name"] == "Marisol Rojas"
    assert rows[lead["id"]]["lost_reason"] == "Precio"
    assert rows[unassigned["id"]]["assigned_to_name"] is None
    assert rows[unassigned["id"]]["lost_reason"] is None
    detail = (await client.get(f"/leads/{lead['id']}", headers=headers)).json()
    assert detail["assigned_to_name"] == "Marisol Rojas"

    # Reasignar y desasignar se reflejan en la misma respuesta (relación recargada).
    other = await create_user(
        session_factory, "dueno.doc@clinica-demo.pe", [Role.OWNER], full_name="Carmen Quispe"
    )
    reassigned = await _patch(client, headers, lead["id"], assigned_to=str(other.id))
    assert reassigned.json()["assigned_to_name"] == "Carmen Quispe"
    cleared = await _patch(client, headers, lead["id"], assigned_to=None)
    assert cleared.json()["assigned_to"] is None and cleared.json()["assigned_to_name"] is None
