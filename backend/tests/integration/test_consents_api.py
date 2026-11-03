"""Consentimientos: plantillas, captura, reglas por método/edad, revocación y firma."""

from typing import Any

import pytest
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.enums import ConsentType, Role
from tests.db_helpers import audit_dump, audit_rows, execute
from tests.helpers import patient_payload
from tests.integration.conftest import Clinic

PNG = "data:image/png;base64,iVBORw0KGgo="
WRITTEN_TYPES = [
    t.value
    for t in ConsentType
    if t not in (ConsentType.GENERAL_CARE, ConsentType.PHOTO_USE, ConsentType.DATA_PROCESSING)
]


def url(clinic: Clinic, patient_id: str | None = None) -> str:
    return f"/patients/{patient_id or clinic.patient['id']}/consents"


def body(kind: str = "PHOTO_USE", **overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "type": kind,
        "method": "PAPER_SCANNED",
        "signed_by_name": "Paciente de Prueba",
    }
    data.update(overrides)
    return data


# ------------------------------------------------------------------ plantillas
async def test_templates_exist_for_every_type_and_are_marked_as_non_legal_examples(
    clinic: Clinic,
) -> None:
    response = await clinic.client.get("/consent-templates", headers=clinic.reception)
    assert response.status_code == 200
    templates = response.json()
    assert {t["type"] for t in templates} == {t.value for t in ConsentType}
    assert all(t["version"] >= 1 and t["body"].strip() for t in templates)
    assert all("EJEMPLO" in t["title"] or "EJEMPLO" in t["body"] for t in templates)


# -------------------------------------------------------------------- permisos
@pytest.mark.parametrize(("role", "expected"), [(Role.SUPERUSER, 403), (Role.PATIENT, 403)])
async def test_superuser_and_patient_cannot_capture_consents(
    clinic: Clinic, role: Role, expected: int
) -> None:
    headers = await clinic.as_role(role, f"{role.value.lower()}-c@clinica-demo.pe")
    response = await clinic.client.post(url(clinic), json=body(), headers=headers)
    assert response.status_code == expected
    assert (await clinic.client.get(url(clinic), headers=headers)).status_code == expected


@pytest.mark.parametrize("who", ["reception", "owner", "doctor"])
async def test_reception_owner_and_doctor_can_capture(clinic: Clinic, who: str) -> None:
    headers = {
        "reception": clinic.reception,
        "owner": clinic.owner,
        "doctor": clinic.doctor_headers,
    }[who]
    response = await clinic.client.post(url(clinic), json=body(), headers=headers)
    assert response.status_code == 201


# --------------------------------------------------------------------- captura
async def test_capture_stores_the_exact_template_version_and_audits_without_content(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    response = await clinic.client.post(
        url(clinic),
        json=body(signed_by_name="NOMBRESECRETO Firmante", witness_name="Testigo"),
        headers=clinic.reception,
    )
    consent = response.json()
    assert consent["text_version"] >= 1 and consent["is_valid"] is True
    assert consent["title"] and consent["has_signature_image"] is False
    assert "signature_image" not in consent
    audit = await audit_rows(engine, "CREATE")
    assert any(r["resource_type"] == "consent" for r in audit)
    assert "NOMBRESECRETO" not in await audit_dump(engine)


async def test_listing_returns_every_consent_newest_first(clinic: Clinic) -> None:
    await clinic.consent("PHOTO_USE")
    rows = (await clinic.client.get(url(clinic), headers=clinic.reception)).json()
    assert [r["type"] for r in rows] == ["PHOTO_USE", "GENERAL_CARE"]


@pytest.mark.parametrize("kind", WRITTEN_TYPES)
async def test_risky_procedures_cannot_be_consented_verbally(clinic: Clinic, kind: str) -> None:
    response = await clinic.client.post(
        url(clinic), json=body(kind, method="VERBAL_RECORDED"), headers=clinic.doctor_headers
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "consent_rule_violation"


@pytest.mark.parametrize("kind", ["GENERAL_CARE", "PHOTO_USE"])
async def test_general_care_and_photos_accept_a_recorded_verbal_consent(
    clinic: Clinic, kind: str
) -> None:
    response = await clinic.client.post(
        url(clinic), json=body(kind, method="VERBAL_RECORDED"), headers=clinic.doctor_headers
    )
    assert response.status_code == 201


async def test_on_screen_consent_needs_a_png_signature(clinic: Clinic) -> None:
    missing = await clinic.client.post(
        url(clinic), json=body(method="ON_SCREEN"), headers=clinic.reception
    )
    not_png = await clinic.client.post(
        url(clinic),
        json=body(method="ON_SCREEN", signature_image="data:text/html;base64,PHNjcmlwdD4="),
        headers=clinic.reception,
    )
    ok = await clinic.client.post(
        url(clinic), json=body(method="ON_SCREEN", signature_image=PNG), headers=clinic.reception
    )
    assert missing.status_code == not_png.status_code == 422
    assert ok.status_code == 201 and ok.json()["has_signature_image"] is True


async def test_minors_need_the_guardian_relationship(clinic: Clinic) -> None:
    minor = await clinic.client.post(
        "/patients",
        json=patient_payload(
            birth_date="2020-05-01",
            guardian={
                "name": "Rosa Gómez",
                "document_type": "DNI",
                "document_number": "40123456",
                "phone": "987654321",
                "relation": "Madre",
            },
        ),
        headers=clinic.reception,
    )
    assert minor.status_code == 201, minor.text
    minor_id = minor.json()["id"]
    refused = await clinic.client.post(
        url(clinic, minor_id), json=body("GENERAL_CARE"), headers=clinic.reception
    )
    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "consent_rule_violation"
    accepted = await clinic.client.post(
        url(clinic, minor_id),
        json=body("GENERAL_CARE", signer_relation="Madre"),
        headers=clinic.reception,
    )
    assert accepted.status_code == 201 and accepted.json()["signer_relation"] == "Madre"


async def test_unknown_patient_and_invalid_type_are_rejected(clinic: Clinic) -> None:
    ghost = "00000000-0000-0000-0000-000000000009"
    assert (
        await clinic.client.post(url(clinic, ghost), json=body(), headers=clinic.reception)
    ).status_code == 404
    assert (
        await clinic.client.post(url(clinic), json=body("INVENTADO"), headers=clinic.reception)
    ).status_code == 422


# ------------------------------------------------------------------ revocación
async def test_revocation_keeps_the_record_and_cannot_be_repeated(clinic: Clinic) -> None:
    consent = await clinic.consent("PHOTO_USE")
    revoke_url = f"/consents/{consent['id']}/revoke"
    revoked = await clinic.client.post(
        revoke_url, json={"reason": "Cambió de opinión"}, headers=clinic.reception
    )
    assert revoked.status_code == 200
    assert revoked.json()["is_valid"] is False and revoked.json()["revoked_at"] is not None
    again = await clinic.client.post(revoke_url, json={"reason": "x"}, headers=clinic.reception)
    assert again.status_code == 409 and again.json()["error"]["code"] == "consent_already_revoked"
    still_listed = (await clinic.client.get(url(clinic), headers=clinic.reception)).json()
    assert consent["id"] in [c["id"] for c in still_listed]
    assert (
        await clinic.client.post(revoke_url, json={"reason": ""}, headers=clinic.reception)
    ).status_code == 422


async def test_revoking_requires_permission_and_an_existing_consent(clinic: Clinic) -> None:
    consent = await clinic.consent("PHOTO_USE")
    superuser = await clinic.as_role(Role.SUPERUSER, "super-r@clinica-demo.pe")
    assert (
        await clinic.client.post(
            f"/consents/{consent['id']}/revoke", json={"reason": "x"}, headers=superuser
        )
    ).status_code == 403
    assert (
        await clinic.client.post(
            "/consents/00000000-0000-0000-0000-000000000009/revoke",
            json={"reason": "x"},
            headers=clinic.reception,
        )
    ).status_code == 404


async def test_database_guards_consents_against_edits_and_deletes(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    consent = await clinic.consent("PHOTO_USE")
    for sql in (
        "UPDATE consents SET signed_by_name = 'otro' WHERE id = :i",
        "UPDATE consents SET text_version = 99 WHERE id = :i",
        "UPDATE consents SET signed_at = now() WHERE id = :i",
        "DELETE FROM consents WHERE id = :i",
    ):
        with pytest.raises(DBAPIError):
            await execute(engine, sql, i=consent["id"])
    # Lo único permitido es revocar.
    await execute(engine, "UPDATE consents SET revoked_at = now() WHERE id = :i", i=consent["id"])


# ------------------------------------------------------------------------ firma
async def test_signature_image_is_for_clinical_roles_with_access_only(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    consent = await clinic.consent("PHOTO_USE", method="ON_SCREEN", signature_image=PNG)
    sig_url = f"/consents/{consent['id']}/signature"
    ok = await clinic.client.get(sig_url, headers=clinic.doctor_headers)
    assert ok.status_code == 200 and ok.json() == {"image": PNG}
    assert (await clinic.client.get(sig_url, headers=clinic.reception)).status_code == 403
    assert (await clinic.client.get(sig_url, headers=clinic.owner)).status_code == 200
    _, outsider = await clinic.new_doctor("ajeno-c@clinica-demo.pe")
    assert (await clinic.client.get(sig_url, headers=outsider)).status_code == 403
    reads = [r for r in await audit_rows(engine, "READ") if r["resource_type"] == "consent"]
    assert len(reads) >= 2 and all(str(r["patient_id"]) == clinic.patient["id"] for r in reads)


async def test_signature_of_a_paper_consent_is_404(clinic: Clinic) -> None:
    consent = await clinic.consent("PHOTO_USE")
    response = await clinic.client.get(
        f"/consents/{consent['id']}/signature", headers=clinic.doctor_headers
    )
    assert response.status_code == 404
