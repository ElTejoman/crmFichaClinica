"""Encuentros clínicos: borrador, checklist, firma, inmutabilidad, adendas e integridad."""

from datetime import timedelta
from typing import Any

import pytest
from pydantic import BaseModel
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.clock import utcnow
from app.domain.clinical_rules import MissingItem
from app.domain.enums import ConsentType, Role, Specialty
from app.domain.specialties import registry
from tests.agenda_helpers import insert_appointment
from tests.db_helpers import audit_dump, audit_rows, execute, scalar
from tests.integration.conftest import VALID_DIAGNOSES, VALID_VITALS, Clinic


def codes(response: Any) -> list[str]:
    return [m["code"] for m in response.json()["error"]["details"]["missing"]]


# ------------------------------------------------------------------ permisos
@pytest.mark.parametrize(
    ("role", "expected"),
    [(Role.RECEPTION, 403), (Role.SUPERUSER, 403), (Role.PATIENT, 403), (Role.OWNER, 403)],
)
async def test_only_doctors_can_open_encounters(clinic: Clinic, role: Role, expected: int) -> None:
    """El dueño LEE contenido clínico pero solo escribe si además es doctor."""
    headers = await clinic.as_role(role, f"{role.value.lower()}-w@clinica-demo.pe")
    response = await clinic.client.post(
        "/encounters",
        json={"patient_id": clinic.patient["id"], "specialty": "ACUPUNCTURE"},
        headers=headers,
    )
    assert response.status_code == expected


async def test_doctor_without_care_relationship_cannot_open_an_encounter(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    _, headers = await clinic.new_doctor("sin.relacion@clinica-demo.pe")
    response = await clinic.client.post(
        "/encounters",
        json={"patient_id": clinic.patient["id"], "specialty": "ACUPUNCTURE"},
        headers=headers,
    )
    assert response.status_code == 403
    denied = await audit_rows(engine, "PERMISSION_DENIED")
    assert any(
        r["reason"] == "sin relación terapéutica (escritura)"
        and str(r["patient_id"]) == clinic.patient["id"]
        for r in denied
    )


async def test_doctor_cannot_write_in_a_specialty_they_do_not_offer(clinic: Clinic) -> None:
    response = await clinic.client.post(
        "/encounters",
        json={"patient_id": clinic.patient["id"], "specialty": "DENTISTRY"},
        headers=clinic.doctor_headers,
    )
    assert response.status_code == 403


async def test_archived_patient_cannot_receive_new_encounters(clinic: Clinic) -> None:
    await clinic.client.patch(
        f"/patients/{clinic.patient['id']}", json={"is_active": False}, headers=clinic.reception
    )
    response = await clinic.client.post(
        "/encounters",
        json={"patient_id": clinic.patient["id"], "specialty": "ACUPUNCTURE"},
        headers=clinic.doctor_headers,
    )
    assert response.status_code == 422 and response.json()["error"]["code"] == "patient_inactive"


async def test_create_requires_an_appointment_or_patient_and_specialty(clinic: Clinic) -> None:
    for body in ({}, {"patient_id": clinic.patient["id"]}, {"specialty": "ACUPUNCTURE"}):
        response = await clinic.client.post("/encounters", json=body, headers=clinic.doctor_headers)
        assert response.status_code == 422


# ---------------------------------------------------------------- desde cita
async def _appointment(clinic: Clinic, status: str, doctor_id: str | None = None) -> str:
    row = await insert_appointment(
        clinic.session_factory,
        patient_id=clinic.patient["id"],
        doctor_id=doctor_id or str(clinic.doctor.id),
        starts_at=utcnow() + timedelta(hours=1),
        status=status,
    )
    return str(row.id)


async def test_encounter_from_a_checked_in_appointment_starts_the_attention(clinic: Clinic) -> None:
    appointment_id = await _appointment(clinic, "CHECKED_IN")
    created = await clinic.draft(appointment_id=appointment_id)
    assert created["status"] == "DRAFT" and created["appointment_id"] == appointment_id
    after = await clinic.client.get(
        f"/appointments/{appointment_id}", headers=clinic.doctor_headers
    )
    assert after.json()["status"] == "IN_PROGRESS"


@pytest.mark.parametrize("status", ["SCHEDULED", "CONFIRMED", "CANCELLED", "COMPLETED"])
async def test_encounter_needs_the_patient_to_have_arrived(clinic: Clinic, status: str) -> None:
    appointment_id = await _appointment(clinic, status)
    response = await clinic.client.post(
        "/encounters", json={"appointment_id": appointment_id}, headers=clinic.doctor_headers
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "appointment_not_ready"


async def test_one_encounter_per_appointment_and_only_for_its_own_doctor(clinic: Clinic) -> None:
    appointment_id = await _appointment(clinic, "CHECKED_IN")
    first = await clinic.draft(appointment_id=appointment_id)
    again = await clinic.client.post(
        "/encounters", json={"appointment_id": appointment_id}, headers=clinic.doctor_headers
    )
    assert again.status_code == 409
    assert again.json()["error"]["details"]["encounter_id"] == first["id"]

    other, other_headers = await clinic.new_doctor("otra@clinica-demo.pe", related=True)
    stolen = await clinic.client.post(
        "/encounters", json={"appointment_id": appointment_id}, headers=other_headers
    )
    assert stolen.status_code == 403
    assert other.id != clinic.doctor.id


async def test_signing_completes_the_linked_appointment(clinic: Clinic) -> None:
    appointment_id = await _appointment(clinic, "CHECKED_IN")
    encounter = await clinic.draft(appointment_id=appointment_id)
    await clinic.fill(encounter["id"])
    signed = await clinic.client.post(
        f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers
    )
    assert signed.status_code == 200
    after = await clinic.client.get(
        f"/appointments/{appointment_id}", headers=clinic.doctor_headers
    )
    assert after.json()["status"] == "COMPLETED"


# --------------------------------------------------------------- edición
async def test_draft_is_edited_partially_and_only_sent_fields_change(clinic: Clinic) -> None:
    encounter = await clinic.draft()
    await clinic.fill(encounter["id"], plan="Plan inicial")
    updated = await clinic.client.patch(
        f"/encounters/{encounter['id']}",
        json={"subjective": "Motivo corregido"},
        headers=clinic.doctor_headers,
    )
    body = updated.json()
    assert body["subjective"] == "Motivo corregido"
    assert body["plan"] == "Plan inicial"  # lo no enviado no cambia
    assert len(body["vitals"]) == 1 and len(body["diagnoses"]) == 1


async def test_bmi_is_always_computed_by_the_server(clinic: Clinic) -> None:
    encounter = await clinic.draft()
    vitals = [{"context": "SINGLE", "weight_kg": 70, "height_cm": 170, "bmi": 99.9}]
    body = await clinic.fill(encounter["id"], vitals=vitals)
    assert body["vitals"][0]["bmi"] == 24.2  # el "bmi" enviado por el cliente se ignora


@pytest.mark.parametrize(
    "vital",
    [
        {"systolic": 400, "diastolic": 80},
        {"temperature_c": 4},
        {"spo2": 120},
        {"pain_vas": 11},
        {"systolic": 80, "diastolic": 90},
        {"systolic": 120},
        {"context": "SINGLE"},  # medición vacía
    ],
)
async def test_implausible_vitals_are_rejected_with_a_clear_code(
    clinic: Clinic, vital: dict[str, Any]
) -> None:
    encounter = await clinic.draft()
    response = await clinic.client.patch(
        f"/encounters/{encounter['id']}", json={"vitals": [vital]}, headers=clinic.doctor_headers
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_vitals"


async def test_serial_vitals_keep_their_context_for_iv_therapy(clinic: Clinic) -> None:
    encounter = await clinic.draft()
    series = [
        {"context": "PRE", "systolic": 118, "diastolic": 76, "heart_rate": 70},
        {"context": "DURING", "systolic": 122, "diastolic": 80, "heart_rate": 74},
        {"context": "POST", "systolic": 120, "diastolic": 78, "heart_rate": 72},
    ]
    body = await clinic.fill(encounter["id"], vitals=series)
    assert [v["context"] for v in body["vitals"]] == ["PRE", "DURING", "POST"]


async def test_diagnoses_are_normalized_filled_from_catalog_and_have_one_primary(
    clinic: Clinic,
) -> None:
    encounter = await clinic.draft()
    body = await clinic.fill(
        encounter["id"],
        diagnoses=[
            {"icd10_code": "k021"},  # normaliza a K02.1 y toma la descripción del catálogo
            {"icd10_code": "M54.5", "is_primary": True},
        ],
    )
    by_code = {d["icd10_code"]: d for d in body["diagnoses"]}
    assert set(by_code) == {"K02.1", "M54.5"}
    assert by_code["K02.1"]["description"] == "Caries de la dentina"
    assert [d["icd10_code"] for d in body["diagnoses"]] == ["M54.5", "K02.1"]  # principal primero
    assert by_code["M54.5"]["is_primary"] and not by_code["K02.1"]["is_primary"]


async def test_without_an_explicit_primary_the_first_diagnosis_becomes_primary(
    clinic: Clinic,
) -> None:
    encounter = await clinic.draft()
    body = await clinic.fill(
        encounter["id"], diagnoses=[{"icd10_code": "M54.2"}, {"icd10_code": "M54.5"}]
    )
    assert [d["is_primary"] for d in body["diagnoses"]].count(True) == 1


@pytest.mark.parametrize(
    "diagnoses",
    [
        [{"icd10_code": "XYZ"}],
        [{"icd10_code": "M54.5"}, {"icd10_code": "m545"}],  # repetido tras normalizar
        [{"icd10_code": "M54.5", "is_primary": True}, {"icd10_code": "M54.2", "is_primary": True}],
        [{"icd10_code": "Q99.9"}],  # formato válido pero fuera del catálogo y sin descripción
    ],
)
async def test_invalid_diagnoses_are_rejected(
    clinic: Clinic, diagnoses: list[dict[str, Any]]
) -> None:
    encounter = await clinic.draft()
    response = await clinic.client.patch(
        f"/encounters/{encounter['id']}",
        json={"diagnoses": diagnoses},
        headers=clinic.doctor_headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_diagnosis"


async def test_a_valid_code_missing_from_the_sample_catalog_is_accepted_with_a_description(
    clinic: Clinic,
) -> None:
    """El catálogo cargado es un subconjunto: no debe bloquear códigos legítimos."""
    encounter = await clinic.draft()
    body = await clinic.fill(
        encounter["id"], diagnoses=[{"icd10_code": "Q99.9", "description": "Anomalía cromosómica"}]
    )
    assert body["diagnoses"][0]["description"] == "Anomalía cromosómica"


async def test_only_the_author_can_edit_and_other_doctors_cannot_even_read_the_draft(
    clinic: Clinic,
) -> None:
    encounter = await clinic.draft()
    _, other_headers = await clinic.new_doctor("otra@clinica-demo.pe", related=True)
    edit = await clinic.client.patch(
        f"/encounters/{encounter['id']}", json={"plan": "x"}, headers=other_headers
    )
    read = await clinic.client.get(f"/encounters/{encounter['id']}", headers=other_headers)
    assert edit.status_code == read.status_code == 403
    # El dueño lee contenido clínico, pero un BORRADOR ajeno sigue siendo trabajo en curso.
    owner = await clinic.client.get(f"/encounters/{encounter['id']}", headers=clinic.owner)
    assert owner.status_code == 403


# ------------------------------------------------------------ checklist y firma
async def test_checklist_of_an_empty_draft_lists_everything_that_is_missing(clinic: Clinic) -> None:
    encounter = await clinic.draft()
    response = await clinic.client.get(
        f"/encounters/{encounter['id']}/signing-checklist", headers=clinic.doctor_headers
    )
    body = response.json()
    assert body["can_sign"] is False
    assert [m["code"] for m in body["missing"]] == [
        "chief_complaint",
        "diagnosis",
        "plan",
        "vitals",
        "history_reviewed",
    ]  # el consentimiento general ya existe en este escenario


async def test_a_complete_draft_can_be_signed_and_a_blocked_one_cannot(clinic: Clinic) -> None:
    encounter = await clinic.draft()
    blocked = await clinic.client.post(
        f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers
    )
    assert blocked.status_code == 422 and blocked.json()["error"]["code"] == "signing_blocked"
    assert "chief_complaint" in codes(blocked)

    await clinic.fill(encounter["id"])
    ready = await clinic.client.get(
        f"/encounters/{encounter['id']}/signing-checklist", headers=clinic.doctor_headers
    )
    assert ready.json() == {"can_sign": True, "missing": []}


@pytest.mark.parametrize(
    ("override", "missing"),
    [
        ({"subjective": "   "}, "chief_complaint"),
        ({"diagnoses": []}, "diagnosis"),
        ({"plan": ""}, "plan"),
        ({"vitals": []}, "vitals"),
        ({"history_reviewed": False}, "history_reviewed"),
    ],
)
async def test_each_requirement_blocks_the_signature_individually(
    clinic: Clinic, override: dict[str, Any], missing: str
) -> None:
    encounter = await clinic.draft()
    await clinic.fill(encounter["id"], **override)
    response = await clinic.client.post(
        f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers
    )
    assert response.status_code == 422
    assert codes(response) == [missing]


async def test_vitals_can_be_waived_with_a_reason(clinic: Clinic) -> None:
    encounter = await clinic.draft()
    await clinic.fill(encounter["id"], vitals=[], vitals_not_applicable_reason="Teleconsulta")
    response = await clinic.client.post(
        f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers
    )
    assert response.status_code == 200


async def test_a_revoked_general_consent_blocks_signing(clinic: Clinic) -> None:
    consents = (
        await clinic.client.get(
            f"/patients/{clinic.patient['id']}/consents", headers=clinic.reception
        )
    ).json()
    general = next(c for c in consents if c["type"] == "GENERAL_CARE")
    revoke = await clinic.client.post(
        f"/consents/{general['id']}/revoke",
        json={"reason": "Retiró su consentimiento"},
        headers=clinic.reception,
    )
    assert revoke.status_code == 200
    encounter = await clinic.draft()
    await clinic.fill(encounter["id"])
    response = await clinic.client.post(
        f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers
    )
    assert codes(response) == ["general_consent"]


async def test_signing_freezes_signer_license_hash_and_timestamp(clinic: Clinic) -> None:
    signed = await clinic.signed()
    assert signed["status"] == "SIGNED"
    assert signed["signer_name"] == "Dra. Acu" and signed["signer_license"] == "CMP CMP-000001"
    assert signed["signed_at"] is not None


async def test_signing_twice_or_editing_after_signing_is_a_conflict(clinic: Clinic) -> None:
    signed = await clinic.signed()
    url = f"/encounters/{signed['id']}"
    again = await clinic.client.post(f"{url}/sign", headers=clinic.doctor_headers)
    edit = await clinic.client.patch(url, json={"plan": "cambio"}, headers=clinic.doctor_headers)
    assert again.status_code == edit.status_code == 409
    assert edit.json()["error"]["code"] == "encounter_not_editable"
    unchanged = (await clinic.client.get(url, headers=clinic.doctor_headers)).json()
    assert unchanged["plan"] == signed["plan"]


# ------------------------------------------- inmutabilidad en la base de datos
async def test_database_rejects_any_change_to_a_signed_encounter(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    """Defensa en profundidad: aunque alguien salte la API, la BD no deja alterar lo firmado."""
    signed = await clinic.signed()
    for sql in (
        "UPDATE encounters SET plan = 'alterado' WHERE id = :i",
        "UPDATE encounters SET subjective = NULL WHERE id = :i",
        "UPDATE encounters SET content_hash = 'x' WHERE id = :i",
        "UPDATE encounters SET status = 'DRAFT' WHERE id = :i",
        "DELETE FROM encounters WHERE id = :i",
        "UPDATE vital_signs SET systolic = 90 WHERE encounter_id = :i",
        "DELETE FROM vital_signs WHERE encounter_id = :i",
        "UPDATE encounter_diagnoses SET icd10_code = 'K02.1' WHERE encounter_id = :i",
        "DELETE FROM encounter_diagnoses WHERE encounter_id = :i",
        "INSERT INTO vital_signs (id, encounter_id, context, measured_at, pain_vas) "
        "VALUES (gen_random_uuid(), :i, 'SINGLE', now(), 5)",
    ):
        with pytest.raises(DBAPIError):
            await execute(engine, sql, i=signed["id"])
    assert (
        await scalar(engine, "SELECT plan FROM encounters WHERE id = :i", i=signed["id"])
        == signed["plan"]
    )


async def test_database_allows_editing_a_draft_and_the_signature_transition(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    encounter = await clinic.draft()
    await execute(engine, "UPDATE encounters SET plan = 'ok' WHERE id = :i", i=encounter["id"])
    assert (
        await scalar(engine, "SELECT plan FROM encounters WHERE id = :i", i=encounter["id"]) == "ok"
    )


# ---------------------------------------------------------------- adendas
async def test_addendum_appends_without_touching_the_signed_content(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    signed = await clinic.signed()
    response = await clinic.client.post(
        f"/encounters/{signed['id']}/addenda",
        json={
            "reason": "Corrección de dosis",
            "text": "Se aclara que el plan incluye hielo local.",
        },
        headers=clinic.doctor_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "AMENDED" and len(body["addenda"]) == 1
    assert body["addenda"][0]["author_license"] == "CMP CMP-000001"
    assert (body["plan"], body["subjective"], body["signed_at"]) == (
        signed["plan"],
        signed["subjective"],
        signed["signed_at"],
    )
    integrity = await clinic.client.get(
        f"/encounters/{signed['id']}/integrity", headers=clinic.doctor_headers
    )
    assert integrity.json()["valid"] is True  # la adenda no altera lo firmado

    second = await clinic.client.post(
        f"/encounters/{signed['id']}/addenda",
        json={"reason": "Otra", "text": "Segunda aclaración"},
        headers=clinic.doctor_headers,
    )
    assert second.status_code == 201 and len(second.json()["addenda"]) == 2
    assert {r["action"] for r in await audit_rows(engine, "AMEND")} == {"AMEND"}


async def test_addenda_are_only_for_signed_encounters_and_by_their_author(clinic: Clinic) -> None:
    draft = await clinic.draft()
    early = await clinic.client.post(
        f"/encounters/{draft['id']}/addenda",
        json={"reason": "x", "text": "y"},
        headers=clinic.doctor_headers,
    )
    assert early.status_code == 409 and early.json()["error"]["code"] == "encounter_not_signed"

    signed = await clinic.signed()
    _, other_headers = await clinic.new_doctor("otra@clinica-demo.pe", related=True)
    foreign = await clinic.client.post(
        f"/encounters/{signed['id']}/addenda",
        json={"reason": "x", "text": "y"},
        headers=other_headers,
    )
    assert foreign.status_code == 403


@pytest.mark.parametrize(
    "body", [{"reason": "", "text": "x"}, {"reason": "x", "text": ""}, {"text": "x"}]
)
async def test_addendum_requires_reason_and_text(clinic: Clinic, body: dict[str, str]) -> None:
    signed = await clinic.signed()
    response = await clinic.client.post(
        f"/encounters/{signed['id']}/addenda", json=body, headers=clinic.doctor_headers
    )
    assert response.status_code == 422


async def test_database_makes_addenda_append_only(clinic: Clinic, engine: AsyncEngine) -> None:
    signed = await clinic.signed()
    await clinic.client.post(
        f"/encounters/{signed['id']}/addenda",
        json={"reason": "r", "text": "t"},
        headers=clinic.doctor_headers,
    )
    for sql in ("UPDATE addenda SET text = 'otro'", "DELETE FROM addenda"):
        with pytest.raises(DBAPIError, match="append-only"):
            await execute(engine, sql)
    draft = await clinic.draft()
    with pytest.raises(DBAPIError, match="solo se añaden a encuentros firmados"):
        await execute(
            engine,
            "INSERT INTO addenda "
            "(id, encounter_id, reason, text, created_by, author_name, created_at) "
            "VALUES (gen_random_uuid(), :e, 'r', 't', :u, 'x', now())",
            e=draft["id"],
            u=str(clinic.doctor.id),
        )


# ------------------------------------------------------------- integridad
async def test_integrity_check_detects_tampering_done_behind_the_applications_back(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    signed = await clinic.signed()
    url = f"/encounters/{signed['id']}/integrity"
    assert (await clinic.client.get(url, headers=clinic.doctor_headers)).json()["valid"] is True

    # Un administrador de BD con privilegios desactiva el trigger y altera el contenido firmado.
    await execute(engine, "ALTER TABLE encounters DISABLE TRIGGER encounters_guard_trg")
    await execute(
        engine, "UPDATE encounters SET plan = 'plan alterado' WHERE id = :i", i=signed["id"]
    )
    await execute(engine, "ALTER TABLE encounters ENABLE TRIGGER encounters_guard_trg")

    result = (await clinic.client.get(url, headers=clinic.doctor_headers)).json()
    assert result["valid"] is False


async def test_integrity_detects_altered_vitals_and_diagnoses_too(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    signed = await clinic.signed()
    await execute(engine, "ALTER TABLE vital_signs DISABLE TRIGGER vital_signs_guard_trg")
    await execute(
        engine, "UPDATE vital_signs SET systolic = 90 WHERE encounter_id = :i", i=signed["id"]
    )
    await execute(engine, "ALTER TABLE vital_signs ENABLE TRIGGER vital_signs_guard_trg")
    url = f"/encounters/{signed['id']}/integrity"
    assert (await clinic.client.get(url, headers=clinic.doctor_headers)).json()["valid"] is False


async def test_integrity_of_a_draft_is_a_conflict(clinic: Clinic) -> None:
    draft = await clinic.draft()
    response = await clinic.client.get(
        f"/encounters/{draft['id']}/integrity", headers=clinic.doctor_headers
    )
    assert response.status_code == 409


# ------------------------------------------------------ lectura y línea de tiempo
async def test_timeline_hides_other_doctors_drafts_but_shows_signed_encounters(
    clinic: Clinic,
) -> None:
    other, other_headers = await clinic.new_doctor("otra@clinica-demo.pe", related=True)
    mine_signed = await clinic.signed()
    await clinic.draft()  # mi borrador
    await clinic.draft(headers=other_headers)  # borrador de otra doctora (misma especialidad)

    mine = (
        await clinic.client.get(
            f"/patients/{clinic.patient['id']}/encounters", headers=clinic.doctor_headers
        )
    ).json()
    assert sorted(e["status"] for e in mine) == ["DRAFT", "SIGNED"]
    theirs = (
        await clinic.client.get(
            f"/patients/{clinic.patient['id']}/encounters", headers=other_headers
        )
    ).json()
    assert sorted(e["status"] for e in theirs) == [
        "DRAFT",
        "SIGNED",
    ]  # su propio borrador + lo firmado
    owner = (
        await clinic.client.get(
            f"/patients/{clinic.patient['id']}/encounters", headers=clinic.owner
        )
    ).json()
    assert [e["status"] for e in owner] == ["SIGNED"]  # el dueño: solo lo firmado
    row = owner[0]
    assert row["id"] == mine_signed["id"] and row["primary_diagnosis_code"] == "M54.5"
    assert row["doctor_name"] == "Dra. Acu" and row["addenda_count"] == 0
    assert other.id != clinic.doctor.id


async def test_timeline_is_newest_first_and_paginated(clinic: Clinic) -> None:
    first = await clinic.signed()
    second = await clinic.signed()
    rows = (
        await clinic.client.get(
            f"/patients/{clinic.patient['id']}/encounters", headers=clinic.doctor_headers
        )
    ).json()
    assert [r["id"] for r in rows] == [second["id"], first["id"]]
    page = (
        await clinic.client.get(
            f"/patients/{clinic.patient['id']}/encounters",
            params={"limit": 1, "offset": 1},
            headers=clinic.doctor_headers,
        )
    ).json()
    assert [r["id"] for r in page] == [first["id"]]


async def test_reception_and_superuser_never_read_clinical_content(clinic: Clinic) -> None:
    signed = await clinic.signed()
    superuser = await clinic.as_role(Role.SUPERUSER, "super-c@clinica-demo.pe")
    for headers in (clinic.reception, superuser):
        assert (
            await clinic.client.get(f"/encounters/{signed['id']}", headers=headers)
        ).status_code == 403
        listing = f"/patients/{clinic.patient['id']}/encounters"
        assert (await clinic.client.get(listing, headers=headers)).status_code == 403


async def test_doctor_without_relationship_cannot_read_signed_encounters(clinic: Clinic) -> None:
    signed = await clinic.signed()
    _, outsider = await clinic.new_doctor("ajeno@clinica-demo.pe")
    assert (
        await clinic.client.get(f"/encounters/{signed['id']}", headers=outsider)
    ).status_code == 403


async def test_ending_the_care_relationship_revokes_access_to_clinical_content(
    clinic: Clinic,
) -> None:
    signed = await clinic.signed()
    await clinic.client.delete(
        f"/patients/{clinic.patient['id']}/care-team/{clinic.doctor.id}", headers=clinic.reception
    )
    assert (
        await clinic.client.get(f"/encounters/{signed['id']}", headers=clinic.doctor_headers)
    ).status_code == 403
    assert (
        await clinic.client.get(f"/encounters/{signed['id']}", headers=clinic.owner)
    ).status_code == 200


# ------------------------------------------------------------------ auditoría
async def test_clinical_audit_trail_has_patient_id_and_never_clinical_content(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    encounter = await clinic.draft()
    await clinic.fill(
        encounter["id"],
        subjective="Cefalea intensa y mareos TEXTOCLINICO-XYZ",
        plan="Reposo absoluto PLANSECRETO-123",
        diagnoses=[{"icd10_code": "R51"}],
    )
    await clinic.client.post(f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers)
    await clinic.client.get(f"/encounters/{encounter['id']}", headers=clinic.doctor_headers)
    await clinic.client.post(
        f"/encounters/{encounter['id']}/addenda",
        json={"reason": "MOTIVOSECRETO", "text": "ADENDASECRETA"},
        headers=clinic.doctor_headers,
    )
    rows = await audit_rows(engine)
    clinical = [r for r in rows if r["resource_type"] == "encounter"]
    assert {r["action"] for r in clinical} >= {"CREATE", "UPDATE", "SIGN", "READ", "AMEND"}
    assert all(str(r["patient_id"]) == clinic.patient["id"] for r in clinical)
    dump = await audit_dump(engine)
    for secret in (
        "TEXTOCLINICO",
        "PLANSECRETO",
        "MOTIVOSECRETO",
        "ADENDASECRETA",
        "Cefalea",
        "R51",
    ):
        assert secret not in dump


# ------------------------------------------------- módulos de especialidad (contrato)
class _Payload(BaseModel):
    points: list[str] = []
    invasive: bool = False


class _FakeAcupuncture:
    specialty = Specialty.ACUPUNCTURE
    schema_version = 1
    payload_model: type[BaseModel] = _Payload

    def missing_for_signing(self, payload: BaseModel | None) -> list[MissingItem]:
        if payload is None or not getattr(payload, "points", None):
            return [MissingItem("points", "Registre al menos un punto")]
        return []

    def consents_required(self, payload: BaseModel | None) -> set[ConsentType]:
        invasive = payload is not None and getattr(payload, "invasive", False)
        return {ConsentType.ACUPUNCTURE_INVASIVE} if invasive else set()


@pytest.fixture
def acupuncture_module() -> Any:
    module = _FakeAcupuncture()
    registry.register(module)
    yield module
    registry.unregister(Specialty.ACUPUNCTURE)


async def test_payload_is_rejected_when_the_specialty_has_no_module(clinic: Clinic) -> None:
    encounter = await clinic.draft()
    response = await clinic.client.put(
        f"/encounters/{encounter['id']}/specialty-payload",
        json={"data": {}},
        headers=clinic.doctor_headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "specialty_module_unavailable"


async def test_specialty_module_adds_its_requirements_to_the_signing_checklist(
    clinic: Clinic, acupuncture_module: Any
) -> None:
    encounter = await clinic.draft()
    await clinic.fill(encounter["id"])
    blocked = await clinic.client.post(
        f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers
    )
    assert codes(blocked) == ["points"]

    saved = await clinic.client.put(
        f"/encounters/{encounter['id']}/specialty-payload",
        json={"data": {"points": ["LI4"], "invasive": True}},
        headers=clinic.doctor_headers,
    )
    assert saved.status_code == 200 and saved.json()["payload"]["schema_version"] == 1
    still = await clinic.client.post(
        f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers
    )
    assert codes(still) == [
        "consent_acupuncture_invasive"
    ]  # el módulo exige consentimiento específico

    await clinic.consent("ACUPUNCTURE_INVASIVE")
    done = await clinic.client.post(
        f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers
    )
    assert done.status_code == 200 and done.json()["payload"]["data"]["points"] == ["LI4"]


async def test_invalid_payload_is_rejected_and_signed_payload_is_frozen(
    clinic: Clinic, acupuncture_module: Any, engine: AsyncEngine
) -> None:
    encounter = await clinic.draft()
    bad = await clinic.client.put(
        f"/encounters/{encounter['id']}/specialty-payload",
        json={"data": {"points": "no-es-una-lista"}},
        headers=clinic.doctor_headers,
    )
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_specialty_payload"

    await clinic.fill(encounter["id"])
    await clinic.client.put(
        f"/encounters/{encounter['id']}/specialty-payload",
        json={"data": {"points": ["LI4"]}},
        headers=clinic.doctor_headers,
    )
    await clinic.client.post(f"/encounters/{encounter['id']}/sign", headers=clinic.doctor_headers)
    after = await clinic.client.put(
        f"/encounters/{encounter['id']}/specialty-payload",
        json={"data": {"points": ["ST36"]}},
        headers=clinic.doctor_headers,
    )
    assert after.status_code == 409
    with pytest.raises(DBAPIError):
        await execute(engine, "UPDATE specialty_payloads SET data = '{}'::jsonb")


async def test_valid_constants_still_match_the_fixture_defaults() -> None:
    """Guarda: si cambian los datos válidos del fixture, estos tests lo detectan de inmediato."""
    assert VALID_VITALS[0]["weight_kg"] == 70 and VALID_DIAGNOSES[0]["icd10_code"] == "M54.5"
