"""Adjuntos clínicos: lista blanca, verificación de bytes, tamaño, consentimiento y descarga."""

import hashlib
from pathlib import Path
from typing import Any

import pytest
from httpx import Response
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.domain.clinical_rules import MAX_ATTACHMENT_BYTES
from app.domain.enums import Role
from tests.db_helpers import audit_dump, audit_rows, execute
from tests.helpers import patient_payload
from tests.integration.conftest import Clinic

PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n" + b"CONTENIDOCLINICOSECRETO"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 16
EXE = b"MZ\x90\x00" + b"\x00" * 32


async def upload(
    clinic: Clinic,
    data: bytes = PDF,
    *,
    name: str = "informe.pdf",
    mime: str = "application/pdf",
    kind: str = "LAB",
    headers: dict[str, str] | None = None,
    patient_id: str | None = None,
    **fields: str,
) -> Response:
    return await clinic.client.post(
        f"/patients/{patient_id or clinic.patient['id']}/attachments",
        files={"file": (name, data, mime)},
        data={"kind": kind, **fields},
        headers=headers or clinic.doctor_headers,
    )


async def uploaded(clinic: Clinic, data: bytes = PDF, **kwargs: Any) -> dict[str, Any]:
    response = await upload(clinic, data, **kwargs)
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


# ---------------------------------------------------------------------- subida
@pytest.mark.parametrize(
    ("data", "name", "mime"),
    [
        (PDF, "a.pdf", "application/pdf"),
        (PNG, "a.png", "image/png"),
        (JPEG, "a.jpg", "image/jpeg"),
        (WEBP, "a.webp", "image/webp"),
    ],
)
async def test_allowed_types_are_stored_with_size_and_sha256(
    clinic: Clinic, data: bytes, name: str, mime: str
) -> None:
    attachment = await uploaded(clinic, data, name=name, mime=mime)
    assert attachment["size_bytes"] == len(data)
    assert attachment["sha256"] == hashlib.sha256(data).hexdigest()
    assert attachment["mime"] == mime and attachment["patient_id"] == clinic.patient["id"]
    assert "storage_key" not in attachment  # la ruta interna nunca sale por la API


@pytest.mark.parametrize(
    ("data", "mime"),
    [
        (EXE, "application/pdf"),  # ejecutable renombrado
        (PNG, "application/pdf"),
        (PDF, "image/png"),
        (b"<script>alert(1)</script>", "image/jpeg"),
        (b"RIFF\x00\x00\x00\x00AVI LIST", "image/webp"),
    ],
)
async def test_content_must_match_the_declared_type(clinic: Clinic, data: bytes, mime: str) -> None:
    response = await upload(clinic, data, mime=mime)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "attachment_rejected"


@pytest.mark.parametrize(
    "mime", ["text/html", "image/svg+xml", "application/x-msdownload", "application/zip"]
)
async def test_types_outside_the_whitelist_are_rejected(clinic: Clinic, mime: str) -> None:
    response = await upload(clinic, PDF, mime=mime, name="x.bin")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "attachment_rejected"


async def test_empty_and_oversized_files_are_rejected(clinic: Clinic) -> None:
    assert (await upload(clinic, b"")).status_code == 422
    too_big = b"%PDF-" + b"0" * MAX_ATTACHMENT_BYTES  # un byte por encima del límite
    response = await upload(clinic, too_big)
    assert response.status_code == 422
    assert "10 MB" in response.json()["error"]["message"]
    exact = b"%PDF-" + b"0" * (MAX_ATTACHMENT_BYTES - 5)
    assert (await upload(clinic, exact)).status_code == 201


async def test_photos_require_the_patients_consent(clinic: Clinic) -> None:
    refused = await upload(clinic, JPEG, mime="image/jpeg", kind="PHOTO", name="foto.jpg")
    assert refused.status_code == 422
    allowed = await upload(
        clinic,
        JPEG,
        mime="image/jpeg",
        kind="PHOTO",
        name="foto.jpg",
        has_patient_consent="true",
    )
    assert allowed.status_code == 201 and allowed.json()["has_patient_consent"] is True


async def test_unknown_kind_is_rejected(clinic: Clinic) -> None:
    assert (await upload(clinic, kind="MALWARE")).status_code == 422


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd", "passwd"),
        ("C:\\Users\\x\\informe.pdf", "informe.pdf"),
        ("a<b>|c?.pdf", "a_b__c_.pdf"),
        ("   ...   ", "archivo"),
        ("análisis (1).pdf", "análisis (1).pdf"),
    ],
)
async def test_display_names_are_sanitized_and_never_become_disk_paths(
    clinic: Clinic, tmp_path: Path, settings: Settings, raw: str, expected: str
) -> None:
    attachment = await uploaded(clinic, name=raw)
    assert attachment["original_name"] == expected
    stored = [p for p in Path(settings.storage_dir).rglob("*") if p.is_file()]
    assert len(stored) == 1
    assert expected not in stored[0].name and stored[0].name != "passwd"


async def test_file_can_be_linked_to_an_encounter_of_the_same_patient_only(clinic: Clinic) -> None:
    encounter = await clinic.draft()
    linked = await uploaded(clinic, encounter_id=encounter["id"])
    assert linked["encounter_id"] == encounter["id"]

    other = (
        await clinic.client.post(
            "/patients", json=patient_payload(first_name="Otra"), headers=clinic.reception
        )
    ).json()
    await clinic.relate(clinic.doctor, other["id"])
    foreign = await upload(clinic, encounter_id=encounter["id"], patient_id=other["id"])
    assert foreign.status_code == 422
    missing = await upload(clinic, encounter_id="00000000-0000-0000-0000-000000000009")
    assert missing.status_code == 422


# -------------------------------------------------------------------- permisos
@pytest.mark.parametrize("role", [Role.RECEPTION, Role.SUPERUSER, Role.PATIENT, Role.OWNER])
async def test_only_doctors_upload(clinic: Clinic, role: Role) -> None:
    headers = await clinic.as_role(role, f"{role.value.lower()}-a@clinica-demo.pe")
    assert (await upload(clinic, headers=headers)).status_code == 403


async def test_doctor_without_relationship_cannot_upload_list_or_download(
    clinic: Clinic,
) -> None:
    attachment = await uploaded(clinic)
    _, outsider = await clinic.new_doctor("ajeno-a@clinica-demo.pe")
    assert (await upload(clinic, headers=outsider)).status_code == 403
    listing = f"/patients/{clinic.patient['id']}/attachments"
    assert (await clinic.client.get(listing, headers=outsider)).status_code == 403
    download = f"/attachments/{attachment['id']}/download"
    assert (await clinic.client.get(download, headers=outsider)).status_code == 403


async def test_reception_and_superuser_cannot_list_or_download(clinic: Clinic) -> None:
    attachment = await uploaded(clinic)
    superuser = await clinic.as_role(Role.SUPERUSER, "super-a@clinica-demo.pe")
    for headers in (clinic.reception, superuser):
        listing = f"/patients/{clinic.patient['id']}/attachments"
        assert (await clinic.client.get(listing, headers=headers)).status_code == 403
        download = f"/attachments/{attachment['id']}/download"
        assert (await clinic.client.get(download, headers=headers)).status_code == 403


async def test_owner_can_list_and_download(clinic: Clinic) -> None:
    attachment = await uploaded(clinic)
    listing = await clinic.client.get(
        f"/patients/{clinic.patient['id']}/attachments", headers=clinic.owner
    )
    assert [a["id"] for a in listing.json()] == [attachment["id"]]
    download = await clinic.client.get(
        f"/attachments/{attachment['id']}/download", headers=clinic.owner
    )
    assert download.status_code == 200


async def test_archived_patient_cannot_receive_new_files(clinic: Clinic) -> None:
    await clinic.client.patch(
        f"/patients/{clinic.patient['id']}", json={"is_active": False}, headers=clinic.reception
    )
    assert (await upload(clinic)).status_code == 422


# -------------------------------------------------------------------- descarga
async def test_download_returns_the_exact_bytes_with_safe_headers(clinic: Clinic) -> None:
    attachment = await uploaded(clinic, name="resultado de laboratorio.pdf")
    response = await clinic.client.get(
        f"/attachments/{attachment['id']}/download", headers=clinic.doctor_headers
    )
    assert response.status_code == 200 and response.content == PDF
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"].startswith("attachment;")
    assert "laboratorio" not in response.headers["content-disposition"]  # sin nombre del paciente
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "no-store" in response.headers["cache-control"]


async def test_download_of_unknown_or_vanished_file(clinic: Clinic, settings: Settings) -> None:
    unknown = await clinic.client.get(
        "/attachments/00000000-0000-0000-0000-000000000009/download", headers=clinic.doctor_headers
    )
    assert unknown.status_code == 404
    attachment = await uploaded(clinic)
    for path in Path(settings.storage_dir).rglob("*"):
        if path.is_file():
            path.unlink()
    gone = await clinic.client.get(
        f"/attachments/{attachment['id']}/download", headers=clinic.doctor_headers
    )
    assert gone.status_code == 404  # la fila existe pero el archivo no: error controlado, no 500
    assert gone.json()["error"]["code"] == "attachment_file_missing"


async def test_listing_is_newest_first(clinic: Clinic) -> None:
    first = await uploaded(clinic, name="uno.pdf")
    second = await uploaded(clinic, name="dos.pdf")
    rows = await clinic.client.get(
        f"/patients/{clinic.patient['id']}/attachments", headers=clinic.doctor_headers
    )
    assert [r["id"] for r in rows.json()] == [second["id"], first["id"]]


# ------------------------------------------------------------------- auditoría
async def test_upload_list_and_download_are_audited_without_names_or_content(
    clinic: Clinic, engine: AsyncEngine
) -> None:
    attachment = await uploaded(clinic, name="NOMBRESECRETO.pdf")
    await clinic.client.get(
        f"/patients/{clinic.patient['id']}/attachments", headers=clinic.doctor_headers
    )
    await clinic.client.get(
        f"/attachments/{attachment['id']}/download", headers=clinic.doctor_headers
    )
    rows = [r for r in await audit_rows(engine) if r["resource_type"] == "attachment"]
    assert {r["action"] for r in rows} == {"CREATE", "READ"}
    assert all(str(r["patient_id"]) == clinic.patient["id"] for r in rows)
    dump = await audit_dump(engine)
    assert "NOMBRESECRETO" not in dump and "CONTENIDOCLINICOSECRETO" not in dump
    # El intento denegado de un doctor ajeno también queda registrado.
    _, outsider = await clinic.new_doctor("ajeno-a2@clinica-demo.pe")
    await clinic.client.get(f"/attachments/{attachment['id']}/download", headers=outsider)
    assert any(
        str(r["patient_id"]) == clinic.patient["id"]
        for r in await audit_rows(engine, "PERMISSION_DENIED")
    )


# ---------------------------------------------------------------- base de datos
async def test_database_makes_attachments_immutable(clinic: Clinic, engine: AsyncEngine) -> None:
    attachment = await uploaded(clinic)
    for sql in (
        "UPDATE attachments SET sha256 = 'x' WHERE id = :i",
        "UPDATE attachments SET original_name = 'otro.pdf' WHERE id = :i",
        "DELETE FROM attachments WHERE id = :i",
    ):
        with pytest.raises(DBAPIError):
            await execute(engine, sql, i=attachment["id"])
