"""Pacientes: permisos, reglas de negocio, búsqueda, duplicados, auditoría y cartera del doctor."""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.clock import lima_today
from app.domain.enums import Role
from app.domain.patient_rules import add_years
from tests.helpers import SessionFactory, create_user, login, patient_payload

AsRole = Callable[..., Awaitable[dict[str, str]]]


async def _audit_rows(engine: AsyncEngine, action: str) -> list[dict[str, object]]:
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT * FROM audit_logs WHERE action = :a ORDER BY id"), {"a": action}
        )
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
async def test_create_patient_permission_matrix(
    client: AsyncClient, as_role: AsRole, role: Role, expected: int
) -> None:
    headers = await as_role(role)
    response = await client.post("/patients", json=patient_payload(), headers=headers)
    assert response.status_code == expected


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        (Role.SUPERUSER, 200),
        (Role.OWNER, 200),
        (Role.DOCTOR, 200),
        (Role.RECEPTION, 200),
        (Role.PATIENT, 403),
    ],
)
async def test_list_patients_permission_matrix(
    client: AsyncClient, as_role: AsRole, role: Role, expected: int
) -> None:
    assert (await client.get("/patients", headers=await as_role(role))).status_code == expected


async def test_unauthenticated_is_rejected(client: AsyncClient) -> None:
    assert (await client.get("/patients")).status_code == 401


# --------------------------------------------------------------------- alta
async def test_create_opens_one_clinical_history_with_sequential_number(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    headers = await as_role(Role.RECEPTION)
    first = (await client.post("/patients", json=patient_payload(), headers=headers)).json()
    second = (await client.post("/patients", json=patient_payload(), headers=headers)).json()

    assert (first["hc_number"], first["hc_code"]) == (1, "HC-000001")
    assert second["hc_code"] == "HC-000002"
    async with engine.connect() as conn:
        count = (await conn.execute(text("SELECT count(*) FROM clinical_histories"))).scalar_one()
    assert count == 2


async def test_retention_date_uses_configured_years(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    headers = await as_role(Role.RECEPTION)
    await client.post("/patients", json=patient_payload(), headers=headers)
    async with engine.connect() as conn:
        retention = (
            await conn.execute(text("SELECT retention_until FROM clinical_histories"))
        ).scalar_one()
    assert retention == add_years(lima_today(), 20)  # RETENTION_YEARS por defecto [VERIFICAR]


async def test_consent_is_mandatory(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    refused = await client.post(
        "/patients", json=patient_payload(data_processing_consent=False), headers=headers
    )
    missing = patient_payload()
    del missing["data_processing_consent"]
    absent = await client.post("/patients", json=missing, headers=headers)
    assert refused.status_code == absent.status_code == 422


async def test_minor_requires_guardian_but_adult_does_not(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    minor = patient_payload(birth_date=str(add_years(lima_today(), -10)))
    refused = await client.post("/patients", json=minor, headers=headers)
    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "guardian_required"

    guardian = {
        "name": "Ana Ríos",
        "document_type": "DNI",
        "document_number": "12345678",
        "phone": "987654321",
        "relation": "Madre",
    }
    accepted = await client.post("/patients", json={**minor, "guardian": guardian}, headers=headers)
    assert accepted.status_code == 201
    body = accepted.json()
    assert body["is_minor"] is True and body["guardian"]["phone"] == "+51987654321"


async def test_person_turning_18_today_is_an_adult(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    response = await client.post(
        "/patients",
        json=patient_payload(birth_date=str(add_years(lima_today(), -18))),
        headers=headers,
    )
    assert response.status_code == 201 and response.json()["is_minor"] is False


@pytest.mark.parametrize("birth_date", [str(lima_today() + timedelta(days=1)), "1850-01-01"])
async def test_implausible_birth_dates_are_rejected(
    client: AsyncClient, as_role: AsRole, birth_date: str
) -> None:
    headers = await as_role(Role.RECEPTION)
    response = await client.post(
        "/patients", json=patient_payload(birth_date=birth_date), headers=headers
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_birth_date"


@pytest.mark.parametrize("number", ["1234567", "123456789", "ABCDEFGH", ""])
async def test_invalid_dni_is_rejected(client: AsyncClient, as_role: AsRole, number: str) -> None:
    headers = await as_role(Role.RECEPTION)
    response = await client.post(
        "/patients", json=patient_payload(document_number=number), headers=headers
    )
    assert response.status_code == 422


async def test_document_and_phone_are_normalized(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    response = await client.post(
        "/patients",
        json=patient_payload(
            document_type="PASSPORT", document_number=" ab123456 ", phone="912 345 678"
        ),
        headers=headers,
    )
    body = response.json()
    assert (body["document_number"], body["phone"]) == ("AB123456", "+51912345678")


async def test_duplicate_document_is_conflict_with_existing_patient_reference(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    original = await client.post(
        "/patients", json=patient_payload(document_number="45678912"), headers=headers
    )
    again = await client.post(
        "/patients", json=patient_payload(document_number="45678912"), headers=headers
    )
    assert again.status_code == 409
    error = again.json()["error"]
    assert error["details"]["code"] == "patient_document_exists"
    assert error["details"]["patient_id"] == original.json()["id"]


async def test_same_document_number_is_allowed_across_document_types(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    a = await client.post(
        "/patients", json=patient_payload(document_number="12345678"), headers=headers
    )
    b = await client.post(
        "/patients",
        json=patient_payload(document_type="CE", document_number="12345678A"),
        headers=headers,
    )
    assert a.status_code == b.status_code == 201


async def test_concurrent_creation_with_same_document_yields_exactly_one_patient(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    """Carrera real: gana una alta; la otra recibe 409 (pre-chequeo o restricción de BD)."""
    headers = await as_role(Role.RECEPTION)
    payload = patient_payload(document_number="77777777")
    responses = await asyncio.gather(
        *(client.post("/patients", json=payload, headers=headers) for _ in range(5))
    )
    codes = sorted(r.status_code for r in responses)
    assert codes == [201, 409, 409, 409, 409]
    async with engine.connect() as conn:
        patients = (await conn.execute(text("SELECT count(*) FROM patients"))).scalar_one()
        histories = (
            await conn.execute(text("SELECT count(*) FROM clinical_histories"))
        ).scalar_one()
    assert patients == histories == 1  # sin pacientes huérfanos ni historias duplicadas


# ---------------------------------------------------------------- búsqueda
async def _seed_people(client: AsyncClient, headers: dict[str, str]) -> None:
    people = [
        ("María", "Gómez Ríos", "45678912", "987654321"),
        ("José", "Pérez Núñez", "46000111", "955111222"),
        ("Ana", "Quispe Huamán", "47111222", "944333111"),
    ]
    for first, last, doc, phone in people:
        response = await client.post(
            "/patients",
            json=patient_payload(
                first_name=first, last_name=last, document_number=doc, phone=phone
            ),
            headers=headers,
        )
        assert response.status_code == 201


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("maria gomez", ["María Gómez Ríos"]),  # sin tildes
        ("GOMEZ", ["María Gómez Ríos"]),  # mayúsculas
        ("gomes", ["María Gómez Ríos"]),  # errata en una palabra
        ("perez nunez", ["José Pérez Núñez"]),  # ñ y tildes
        ("4567", ["María Gómez Ríos"]),  # prefijo de documento
        ("955111", ["José Pérez Núñez"]),  # fragmento de teléfono
        ("%", []),  # comodín tratado como texto, no como "todo"
        ("_", []),
        ("zzzzzz", []),
    ],
)
async def test_search_is_accent_insensitive_and_typo_tolerant(
    client: AsyncClient, as_role: AsRole, query: str, expected: list[str]
) -> None:
    headers = await as_role(Role.RECEPTION)
    await _seed_people(client, headers)
    found = (await client.get("/patients", params={"q": query}, headers=headers)).json()
    assert [p["full_name"] for p in found] == expected


async def test_listing_is_ordered_paginated_and_hides_archived(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    await _seed_people(client, headers)
    everyone = (await client.get("/patients", headers=headers)).json()
    assert [p["full_name"] for p in everyone] == [
        "María Gómez Ríos",
        "José Pérez Núñez",
        "Ana Quispe Huamán",
    ]  # orden por apellido
    page = (await client.get("/patients", params={"limit": 1, "offset": 1}, headers=headers)).json()
    assert [p["full_name"] for p in page] == ["José Pérez Núñez"]

    await client.patch(f"/patients/{everyone[0]['id']}", json={"is_active": False}, headers=headers)
    visible = (await client.get("/patients", headers=headers)).json()
    with_archived = (
        await client.get("/patients", params={"include_inactive": True}, headers=headers)
    ).json()
    assert len(visible) == 2 and len(with_archived) == 3


async def test_summary_exposes_only_minimal_fields(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    await client.post(
        "/patients",
        json=patient_payload(address="Av. Secreta 123", email="x@y.pe", insurance="Pacífico"),
        headers=headers,
    )
    row = (await client.get("/patients", headers=headers)).json()[0]
    assert not {"address", "email", "insurance", "guardian", "emergency_contact"} & row.keys()


# -------------------------------------------------------------- duplicados
async def test_possible_duplicates_by_name_and_birth_date_ignoring_accents(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    await _seed_people(client, headers)
    candidates = (
        await client.get(
            "/patients/duplicates",
            params={"first_name": "Maria", "last_name": "Gomez Rios", "birth_date": "1988-03-14"},
            headers=headers,
        )
    ).json()
    assert len(candidates) == 1
    assert candidates[0]["full_name"] == "María Gómez Ríos"
    assert candidates[0]["document_number_masked"] == "*****912"  # documento enmascarado
    assert "45678912" not in str(candidates)


async def test_possible_duplicates_by_phone_and_none_when_unrelated(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    await _seed_people(client, headers)
    by_phone = (
        await client.get(
            "/patients/duplicates",
            params={"first_name": "Otra", "last_name": "Persona", "phone": "987 654 321"},
            headers=headers,
        )
    ).json()
    assert [c["reasons"] for c in by_phone] == [["Mismo teléfono"]]
    unrelated = await client.get(
        "/patients/duplicates",
        params={"first_name": "Carlos", "last_name": "Zegarra", "birth_date": "1970-01-01"},
        headers=headers,
    )
    assert unrelated.json() == []


async def test_name_alone_is_not_enough_to_flag_a_duplicate(
    client: AsyncClient, as_role: AsRole
) -> None:
    """Homónimos con distinta fecha de nacimiento NO son duplicados (evita falsos positivos)."""
    headers = await as_role(Role.RECEPTION)
    await _seed_people(client, headers)
    response = await client.get(
        "/patients/duplicates",
        params={"first_name": "María", "last_name": "Gómez Ríos", "birth_date": "1999-09-09"},
        headers=headers,
    )
    assert response.json() == []


async def test_doctor_cannot_probe_duplicates(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.DOCTOR)
    response = await client.get(
        "/patients/duplicates", params={"first_name": "A", "last_name": "B"}, headers=headers
    )
    assert response.status_code == 403


# --------------------------------------------------------------- lectura
async def test_reading_a_patient_is_audited_with_patient_id(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    headers = await as_role(Role.RECEPTION)
    created = (await client.post("/patients", json=patient_payload(), headers=headers)).json()
    await client.get(f"/patients/{created['id']}", headers=headers)

    reads = await _audit_rows(engine, "READ")
    assert len(reads) == 1
    assert str(reads[0]["patient_id"]) == created["id"]
    assert reads[0]["resource_type"] == "patient" and reads[0]["outcome"] == "SUCCESS"


async def test_audit_never_stores_personal_data(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    headers = await as_role(Role.RECEPTION)
    payload = patient_payload(
        first_name="Zoraida", last_name="Inconfundible", document_number="48484848"
    )
    created = (await client.post("/patients", json=payload, headers=headers)).json()
    await client.patch(
        f"/patients/{created['id']}",
        json={"address": "Calle Reservada 999", "phone": "999888777"},
        headers=headers,
    )
    await client.get(f"/patients/{created['id']}", headers=headers)
    async with engine.connect() as conn:
        dump = str((await conn.execute(text("SELECT * FROM audit_logs"))).all())
    for secret in ("Zoraida", "Inconfundible", "48484848", "Calle Reservada", "999888777"):
        assert secret not in dump


async def test_unknown_patient_is_404(client: AsyncClient, as_role: AsRole) -> None:
    headers = await as_role(Role.RECEPTION)
    response = await client.get("/patients/00000000-0000-0000-0000-000000000000", headers=headers)
    assert response.status_code == 404


# -------------------------------------------------------------- edición
async def test_partial_update_applies_only_sent_fields_and_null_clears(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    created = (
        await client.post(
            "/patients",
            json=patient_payload(occupation="Contadora", district="Miraflores", phone="987654321"),
            headers=headers,
        )
    ).json()
    updated = (
        await client.patch(
            f"/patients/{created['id']}",
            json={"occupation": None, "district": "Surco"},
            headers=headers,
        )
    ).json()
    assert updated["occupation"] is None  # null vacía
    assert updated["district"] == "Surco"
    assert updated["phone"] == "+51987654321"  # lo no enviado no cambia
    assert updated["first_name"] == "María"


async def test_document_cannot_be_changed_through_patch(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    created = (
        await client.post(
            "/patients", json=patient_payload(document_number="45678912"), headers=headers
        )
    ).json()
    patched = await client.patch(
        f"/patients/{created['id']}",
        json={"document_number": "99999999", "document_type": "CE"},
        headers=headers,
    )
    assert patched.json()["document_number"] == "45678912"
    assert patched.json()["document_type"] == "DNI"


async def test_update_audit_lists_field_names_only(
    client: AsyncClient, as_role: AsRole, engine: AsyncEngine
) -> None:
    headers = await as_role(Role.RECEPTION)
    created = (await client.post("/patients", json=patient_payload(), headers=headers)).json()
    await client.patch(
        f"/patients/{created['id']}", json={"district": "Surco", "occupation": "X"}, headers=headers
    )
    updates = await _audit_rows(engine, "UPDATE")
    assert updates[-1]["reason"] == "campos=district,occupation"


async def test_cannot_make_patient_a_minor_without_guardian_via_update(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    created = (await client.post("/patients", json=patient_payload(), headers=headers)).json()
    response = await client.patch(
        f"/patients/{created['id']}",
        json={"birth_date": str(add_years(lima_today(), -5))},
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "guardian_required"


async def test_guardian_and_emergency_contact_can_be_set_and_cleared(
    client: AsyncClient, as_role: AsRole
) -> None:
    headers = await as_role(Role.RECEPTION)
    created = (await client.post("/patients", json=patient_payload(), headers=headers)).json()
    contact = {"name": "Luis Gómez", "phone": "911222333", "relation": "Hermano"}
    with_contact = (
        await client.patch(
            f"/patients/{created['id']}", json={"emergency_contact": contact}, headers=headers
        )
    ).json()
    assert with_contact["emergency_contact"]["phone"] == "+51911222333"
    cleared = (
        await client.patch(
            f"/patients/{created['id']}", json={"emergency_contact": None}, headers=headers
        )
    ).json()
    assert cleared["emergency_contact"] is None


async def test_doctor_cannot_update_patient(client: AsyncClient, as_role: AsRole) -> None:
    owner = await as_role(Role.OWNER)
    created = (await client.post("/patients", json=patient_payload(), headers=owner)).json()
    doctor = await as_role(Role.DOCTOR)
    response = await client.patch(
        f"/patients/{created['id']}", json={"district": "Surco"}, headers=doctor
    )
    assert response.status_code == 403


# ------------------------------------------- relación terapéutica y cartera
async def _doctor(
    client: AsyncClient, session_factory: SessionFactory, email: str, roles: list[Role]
) -> tuple[dict[str, str], str]:
    user = await create_user(session_factory, email, roles)
    return await login(client, email), str(user.id)


async def test_doctor_only_sees_patients_with_active_care_relationship(
    client: AsyncClient, as_role: AsRole, session_factory: SessionFactory, engine: AsyncEngine
) -> None:
    reception = await as_role(Role.RECEPTION)
    mine = (
        await client.post("/patients", json=patient_payload(first_name="Mía"), headers=reception)
    ).json()
    other = (
        await client.post("/patients", json=patient_payload(first_name="Ajena"), headers=reception)
    ).json()
    doctor_headers, doctor_id = await _doctor(
        client, session_factory, "doc@clinica-demo.pe", [Role.DOCTOR]
    )

    # Antes de asignar: cartera vacía y acceso denegado.
    assert (await client.get("/patients", headers=doctor_headers)).json() == []
    assert (await client.get(f"/patients/{mine['id']}", headers=doctor_headers)).status_code == 403

    assign = await client.post(
        f"/patients/{mine['id']}/care-team", json={"doctor_user_id": doctor_id}, headers=reception
    )
    assert assign.status_code == 201

    listed = (await client.get("/patients", headers=doctor_headers)).json()
    assert [p["id"] for p in listed] == [mine["id"]]
    assert (await client.get(f"/patients/{mine['id']}", headers=doctor_headers)).status_code == 200

    denied = await client.get(f"/patients/{other['id']}", headers=doctor_headers)
    assert denied.status_code == 403
    rows = await _audit_rows(engine, "PERMISSION_DENIED")
    assert any(str(r["patient_id"]) == other["id"] and r["outcome"] == "DENIED" for r in rows)

    # Al finalizar la relación, el acceso se pierde de inmediato.
    ended = await client.delete(f"/patients/{mine['id']}/care-team/{doctor_id}", headers=reception)
    assert ended.status_code == 204
    assert (await client.get(f"/patients/{mine['id']}", headers=doctor_headers)).status_code == 403
    assert (await client.get("/patients", headers=doctor_headers)).json() == []


async def test_owner_who_is_also_doctor_sees_the_whole_portfolio(
    client: AsyncClient, as_role: AsRole, session_factory: SessionFactory
) -> None:
    reception = await as_role(Role.RECEPTION)
    await client.post("/patients", json=patient_payload(), headers=reception)
    await client.post("/patients", json=patient_payload(), headers=reception)
    headers, _ = await _doctor(
        client, session_factory, "duena@clinica-demo.pe", [Role.OWNER, Role.DOCTOR]
    )
    assert len((await client.get("/patients", headers=headers)).json()) == 2


async def test_assign_validates_the_doctor_and_prevents_duplicates(
    client: AsyncClient, as_role: AsRole, session_factory: SessionFactory
) -> None:
    reception = await as_role(Role.RECEPTION)
    patient = (await client.post("/patients", json=patient_payload(), headers=reception)).json()
    _, doctor_id = await _doctor(client, session_factory, "doc@clinica-demo.pe", [Role.DOCTOR])
    _, reception_id = await _doctor(
        client, session_factory, "otra@clinica-demo.pe", [Role.RECEPTION]
    )
    url = f"/patients/{patient['id']}/care-team"

    not_a_doctor = await client.post(url, json={"doctor_user_id": reception_id}, headers=reception)
    assert not_a_doctor.status_code == 422
    assert not_a_doctor.json()["error"]["code"] == "invalid_doctor"
    unknown = await client.post(
        url, json={"doctor_user_id": "00000000-0000-0000-0000-000000000000"}, headers=reception
    )
    assert unknown.status_code == 422

    assert (
        await client.post(url, json={"doctor_user_id": doctor_id}, headers=reception)
    ).status_code == 201
    assert (
        await client.post(url, json={"doctor_user_id": doctor_id}, headers=reception)
    ).status_code == 409


async def test_care_team_listing_shows_history_with_doctor_names(
    client: AsyncClient, as_role: AsRole, session_factory: SessionFactory
) -> None:
    reception = await as_role(Role.RECEPTION)
    patient = (await client.post("/patients", json=patient_payload(), headers=reception)).json()
    _, doctor_id = await _doctor(client, session_factory, "doc@clinica-demo.pe", [Role.DOCTOR])
    url = f"/patients/{patient['id']}/care-team"
    await client.post(url, json={"doctor_user_id": doctor_id}, headers=reception)
    await client.delete(f"{url}/{doctor_id}", headers=reception)
    await client.post(url, json={"doctor_user_id": doctor_id}, headers=reception)  # reasignación

    members = (await client.get(url, headers=reception)).json()
    assert len(members) == 2
    assert {m["doctor_name"] for m in members} == {"Usuario de Prueba"}
    assert sorted(m["is_active"] for m in members) == [False, True]


async def test_ending_a_missing_assignment_is_404(
    client: AsyncClient, as_role: AsRole, session_factory: SessionFactory
) -> None:
    reception = await as_role(Role.RECEPTION)
    patient = (await client.post("/patients", json=patient_payload(), headers=reception)).json()
    _, doctor_id = await _doctor(client, session_factory, "doc@clinica-demo.pe", [Role.DOCTOR])
    response = await client.delete(
        f"/patients/{patient['id']}/care-team/{doctor_id}", headers=reception
    )
    assert response.status_code == 404


async def test_doctor_directory_lists_only_active_doctors(
    client: AsyncClient, as_role: AsRole, session_factory: SessionFactory
) -> None:
    await create_user(
        session_factory, "activo@clinica-demo.pe", [Role.DOCTOR], full_name="Dr. Activo"
    )
    await create_user(
        session_factory,
        "baja@clinica-demo.pe",
        [Role.DOCTOR],
        full_name="Dr. De Baja",
        is_active=False,
    )
    await create_user(
        session_factory, "otro@clinica-demo.pe", [Role.RECEPTION], full_name="No Doctor"
    )
    headers = await as_role(Role.RECEPTION)
    doctors = (await client.get("/doctors", headers=headers)).json()
    assert [d["full_name"] for d in doctors] == ["Dr. Activo"]
    assert doctors[0]["specialties"] == ["ACUPUNCTURE"]
