"""Adjuntos clínicos: subida (multipart), listado y descarga."""

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, Response, UploadFile, status

from app.api.deps import AttachmentServiceDep, ClinicalReader, ClinicalWriter, ContextDep
from app.domain.clinical_rules import MAX_ATTACHMENT_BYTES
from app.domain.enums import AttachmentKind
from app.schemas.clinical import AttachmentRead

router = APIRouter(tags=["adjuntos"])


@router.post(
    "/patients/{patient_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    patient_id: uuid.UUID,
    actor: ClinicalWriter,
    service: AttachmentServiceDep,
    context: ContextDep,
    file: Annotated[UploadFile, File()],
    kind: Annotated[AttachmentKind, Form()],
    has_patient_consent: Annotated[bool, Form()] = False,
    encounter_id: Annotated[uuid.UUID | None, Form()] = None,
) -> AttachmentRead:
    # Se lee un byte de más para detectar el exceso sin cargar archivos enormes en memoria.
    data = await file.read(MAX_ATTACHMENT_BYTES + 1)
    attachment = await service.upload(
        actor,
        patient_id,
        data=data,
        filename=file.filename or "archivo",
        mime=file.content_type or "application/octet-stream",
        kind=kind,
        encounter_id=encounter_id,
        has_patient_consent=has_patient_consent,
        context=context,
    )
    return AttachmentRead.model_validate(attachment)


@router.get("/patients/{patient_id}/attachments", response_model=list[AttachmentRead])
async def list_attachments(
    patient_id: uuid.UUID, actor: ClinicalReader, service: AttachmentServiceDep, context: ContextDep
) -> list[AttachmentRead]:
    rows = await service.list_for_patient(actor, patient_id, context)
    return [AttachmentRead.model_validate(a) for a in rows]


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID,
    actor: ClinicalReader,
    service: AttachmentServiceDep,
    context: ContextDep,
) -> Response:
    attachment, content = await service.download(actor, attachment_id, context)
    return Response(
        content=content,
        media_type=attachment.mime,
        headers={
            # Siempre como descarga y sin que el navegador "adivine" el tipo (XSS en adjuntos).
            "Content-Disposition": f'attachment; filename="{attachment.id}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )
