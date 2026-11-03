"""Resumen clínico, alergias, medicación, antecedentes y búsqueda CIE-10."""

from typing import Any

import pytest
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.enums import Role
from tests.db_helpers import audit_dump, audit_rows, execute
from tests.integration.conftest import Clinic

ALLERGY = {"substance": "Penicilina", "reaction": "Urticaria", "severity": "SEVERE"}
MEDICATION = {"name": "Ibuprofeno", "dose": "400 mg", "frequency": "c/8h"}
CONDITION = {"kind": "PERSONAL", "icd10_code": "e119", "description": "Diabetes tipo 2"}


async def add(clinic: Clinic, kind: str, body: dict[str, Any]) -> dict[str, Any]:
    response = await clinic.client.post(
        f"/patients/{clinic.patient['id']}/{kind}", json=body, headers=clinic.doctor_headers
    )
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


# ------------------------------------------------------------------ permisos
@pytest.mark.parametrize("kind", ["allergies", "medications", "conditions", "clinical-summary"])
@pytest.mark.parametrize("role", [Role.RECEPTION, Role.SUPERUSER, Role.PATIENT])
async def test_non_clinical_roles_cannot_read_clinical_history(
    clinic: Clinic, kind: str, role: Role
) -> None:
    headers = await clinic.as_role(role, f"{role.value.lower()}-h@clinica-demo.pe")
    response = await clinic.client.get(f"/patients/{clinic.patient['id']}/{kind}", headers=headers)
    assert response.status_code == 403


@pytest.mark.parametrize(
    ("kind", "body"),
    [("allergies", ALLERGY), ("medications", MEDICATION), ("conditions", CONDITION)],
)
async def test_only_doctors_write_and_owner_only_reads(
    clinic: Clinic, kind: str, body: dict[str, Any]
) -> None:
    url = f"/patients/{clinic.patient['id']}/{kind}"
    for headers in (clinic.reception, clinic.owner):
        assert (await clinic.client.post(url, json=body, headers=headers)).status_code == 403
    await add(clinic, kind, body)
    assert (await clinic.client.get(url, headers=clinic.owner)).status_code == 200


async def test_doctor_without_relationship_is_denied_and_the_denial_is_audited(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    _, outsider = await clinic.new_doctor("ajeno-h@clinica-demo.pe")
    url = f"/patients/{clinic.patient['id']}/clinical-summary"
    assert (await clinic.client.get(url, headers=outsider)).status_code == 403
    denied = await audit_rows(engine, "PERMISSION_DENIED")
    assert any(str(r["patient_id"]) == clinic.patient["id"] for r in denied)


# -------------------------------------------------------------------- alergias
async def test_allergy_lifecycle_never_deletes_and_hides_inactive_by_default(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    allergy = await add(clinic, "allergies", {**ALLERGY, "verified": True})
    assert allergy["status"] == "ACTIVE" and allergy["verified_at"] is not None
    url = f"/patients/{clinic.patient['id']}/allergies"

    patched = await clinic.client.patch(
        f"/allergies/{allergy['id']}", json={"status": "INACTIVE"}, headers=clinic.doctor_headers
    )
    assert patched.status_code == 200 and patched.json()["status"] == "INACTIVE"
    assert (await clinic.client.get(url, headers=clinic.doctor_headers)).json() == []
    everything = await clinic.client.get(
        url, params={"include_inactive": True}, headers=clinic.doctor_headers
    )
    assert [a["id"] for a in everything.json()] == [allergy["id"]]

    # Sin borrado físico: la BD lo impide aunque se salte la API.
    with pytest.raises(DBAPIError):
        await execute(engine, "DELETE FROM allergies")


@pytest.mark.parametrize(
    "body",
    [
        {"substance": "", "severity": "MILD"},
        {"substance": "Polen", "severity": "TERRIBLE"},
        {"severity": "MILD"},
    ],
)
async def test_invalid_allergies_are_rejected(clinic: Clinic, body: dict[str, Any]) -> None:
    response = await clinic.client.post(
        f"/patients/{clinic.patient['id']}/allergies", json=body, headers=clinic.doctor_headers
    )
    assert response.status_code == 422


async def test_another_doctor_with_relationship_can_update_but_one_without_cannot(
    clinic: Clinic,
) -> None:
    allergy = await add(clinic, "allergies", ALLERGY)
    _, outsider = await clinic.new_doctor("ajeno2-h@clinica-demo.pe")
    denied = await clinic.client.patch(
        f"/allergies/{allergy['id']}", json={"severity": "MILD"}, headers=outsider
    )
    assert denied.status_code == 403
    _, colleague = await clinic.new_doctor("colega-h@clinica-demo.pe", related=True)
    allowed = await clinic.client.patch(
        f"/allergies/{allergy['id']}", json={"severity": "MODERATE"}, headers=colleague
    )
    assert allowed.status_code == 200 and allowed.json()["severity"] == "MODERATE"


async def test_updating_an_unknown_record_is_404(clinic: Clinic) -> None:
    missing = "00000000-0000-0000-0000-000000000001"
    for kind in ("allergies", "medications", "conditions"):
        response = await clinic.client.patch(
            f"/{kind}/{missing}", json={}, headers=clinic.doctor_headers
        )
        assert response.status_code == 404


# ----------------------------------------------------------------- medicación
async def test_medication_can_be_stopped_and_dates_are_validated(clinic: Clinic) -> None:
    medication = await add(clinic, "medications", {**MEDICATION, "since": "2026-01-10"})
    stopped = await clinic.client.patch(
        f"/medications/{medication['id']}",
        json={"status": "INACTIVE", "until": "2026-02-01"},
        headers=clinic.doctor_headers,
    )
    assert stopped.json()["status"] == "INACTIVE" and stopped.json()["until"] == "2026-02-01"
    reversed_dates = await clinic.client.post(
        f"/patients/{clinic.patient['id']}/medications",
        json={**MEDICATION, "since": "2026-03-01", "until": "2026-01-01"},
        headers=clinic.doctor_headers,
    )
    assert reversed_dates.status_code == 422


# ----------------------------------------------------------------- antecedentes
async def test_condition_icd10_is_normalized_and_validated(clinic: Clinic) -> None:
    condition = await add(clinic, "conditions", CONDITION)
    assert condition["icd10_code"] == "E11.9"
    no_code = await add(clinic, "conditions", {"kind": "SURGICAL", "description": "Apendicectomía"})
    assert no_code["icd10_code"] is None
    bad = await clinic.client.post(
        f"/patients/{clinic.patient['id']}/conditions",
        json={**CONDITION, "icd10_code": "999"},
        headers=clinic.doctor_headers,
    )
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_icd10"


# --------------------------------------------------------------------- resumen
async def test_summary_of_a_new_patient_is_empty_but_shows_consent_status(clinic: Clinic) -> None:
    body = (
        await clinic.client.get(
            f"/patients/{clinic.patient['id']}/clinical-summary", headers=clinic.doctor_headers
        )
    ).json()
    assert body["allergies"] == [] and body["last_vitals"] is None
    assert body["signed_encounters"] == 0 and body["last_encounter_at"] is None
    assert body["consents"] == {"general_care": True, "data_processing": False}


async def test_summary_puts_active_alerts_and_last_signed_vitals_together(clinic: Clinic) -> None:
    await add(clinic, "allergies", ALLERGY)
    inactive = await add(clinic, "allergies", {**ALLERGY, "substance": "Látex"})
    await clinic.client.patch(
        f"/allergies/{inactive['id']}", json={"status": "INACTIVE"}, headers=clinic.doctor_headers
    )
    await add(clinic, "medications", MEDICATION)
    await add(clinic, "conditions", CONDITION)
    await clinic.signed()
    draft = await clinic.draft()  # un borrador NO debe contar ni aportar signos vitales
    await clinic.fill(draft["id"], vitals=[{"context": "SINGLE", "heart_rate": 150}])

    body = (
        await clinic.client.get(
            f"/patients/{clinic.patient['id']}/clinical-summary", headers=clinic.doctor_headers
        )
    ).json()
    assert [a["substance"] for a in body["allergies"]] == ["Penicilina"]
    assert [m["name"] for m in body["medications"]] == ["Ibuprofeno"]
    assert [c["description"] for c in body["conditions"]] == ["Diabetes tipo 2"]
    assert body["signed_encounters"] == 1
    assert body["last_vitals"]["heart_rate"] == 72
    assert body["last_encounter_at"] is not None


async def test_clinical_history_access_is_audited_without_clinical_content(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    await add(clinic, "allergies", {**ALLERGY, "substance": "SUSTANCIASECRETA"})
    await add(clinic, "conditions", {**CONDITION, "description": "DIAGNOSTICOSECRETO"})
    await clinic.client.get(
        f"/patients/{clinic.patient['id']}/clinical-summary", headers=clinic.doctor_headers
    )
    rows = await audit_rows(engine)
    resources = {r["resource_type"] for r in rows}
    assert {"allergy", "condition", "clinical_summary"} <= resources
    assert all(
        str(r["patient_id"]) == clinic.patient["id"]
        for r in rows
        if r["resource_type"] in {"allergy", "condition", "clinical_summary"}
    )
    dump = await audit_dump(engine)
    assert "SECRET" not in dump and "Penicilina" not in dump and "E11" not in dump


# ----------------------------------------------------------------------- CIE-10
@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("M54.5", "M54.5"),
        ("m545", "M54.5"),  # sin punto y en minúscula
        ("lumbalgia", "M54.5"),
        ("LUMBALGIA", "M54.5"),
        ("caries", "K02"),  # coincide por prefijo de código
        ("lunbalgia", "M54.5"),  # errata
    ],
)
async def test_icd10_search_by_code_text_accents_and_typos(
    clinic: Clinic, query: str, expected: str
) -> None:
    response = await clinic.client.get("/icd10", params={"q": query}, headers=clinic.doctor_headers)
    assert response.status_code == 200
    assert any(r["code"].startswith(expected) for r in response.json()), response.json()


async def test_icd10_search_limits_empty_queries_and_permissions(clinic: Clinic) -> None:
    assert (await clinic.client.get("/icd10", headers=clinic.doctor_headers)).json() == []
    limited = await clinic.client.get(
        "/icd10", params={"q": "dolor", "limit": 3}, headers=clinic.doctor_headers
    )
    assert 0 < len(limited.json()) <= 3
    assert (
        await clinic.client.get(
            "/icd10", params={"limit": 500, "q": "x"}, headers=clinic.doctor_headers
        )
    ).status_code == 422
    assert (
        await clinic.client.get("/icd10", params={"q": "dolor"}, headers=clinic.reception)
    ).status_code == 403


async def test_icd10_search_escapes_like_wildcards(clinic: Clinic) -> None:
    """Un `%` del usuario no debe comportarse como comodín que devuelva todo el catálogo."""
    response = await clinic.client.get(
        "/icd10", params={"q": "%", "limit": 50}, headers=clinic.doctor_headers
    )
    assert response.status_code == 200
    assert len(response.json()) < 50
