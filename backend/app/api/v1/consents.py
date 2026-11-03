"""Consentimientos informados: plantillas, captura, consulta y revocación."""

import uuid

from fastapi import APIRouter, status

from app.api.deps import (
    ClinicalReader,
    ConsentsCapturer,
    ConsentServiceDep,
    ContextDep,
)
from app.schemas.clinical import (
    ConsentCreate,
    ConsentRead,
    ConsentTemplateRead,
    RevokeBody,
    SignatureImage,
)

router = APIRouter(tags=["consentimientos"])


@router.get("/consent-templates", response_model=list[ConsentTemplateRead])
async def list_templates(
    _: ConsentsCapturer, service: ConsentServiceDep
) -> list[ConsentTemplateRead]:
    return [ConsentTemplateRead.model_validate(t) for t in await service.list_templates()]


@router.get("/patients/{patient_id}/consents", response_model=list[ConsentRead])
async def list_consents(
    patient_id: uuid.UUID, _: ConsentsCapturer, service: ConsentServiceDep
) -> list[ConsentRead]:
    return [ConsentRead.model_validate(c) for c in await service.list_for_patient(patient_id)]


@router.post(
    "/patients/{patient_id}/consents",
    response_model=ConsentRead,
    status_code=status.HTTP_201_CREATED,
)
async def capture_consent(
    patient_id: uuid.UUID,
    body: ConsentCreate,
    actor: ConsentsCapturer,
    service: ConsentServiceDep,
    context: ContextDep,
) -> ConsentRead:
    return ConsentRead.model_validate(await service.capture(actor, patient_id, body, context))


@router.post("/consents/{consent_id}/revoke", response_model=ConsentRead)
async def revoke_consent(
    consent_id: uuid.UUID,
    body: RevokeBody,
    actor: ConsentsCapturer,
    service: ConsentServiceDep,
    context: ContextDep,
) -> ConsentRead:
    return ConsentRead.model_validate(await service.revoke(actor, consent_id, body.reason, context))


@router.get("/consents/{consent_id}/signature", response_model=SignatureImage)
async def consent_signature(
    consent_id: uuid.UUID, actor: ClinicalReader, service: ConsentServiceDep, context: ContextDep
) -> SignatureImage:
    """La imagen de la firma solo la ve quien tiene acceso clínico (recepción no)."""
    return SignatureImage(image=await service.signature_image(actor, consent_id, context))
