"""Encuentros clínicos: borrador, checklist, firma, adendas e integridad."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import ClinicalReader, ClinicalWriter, ContextDep, EncounterServiceDep
from app.schemas.clinical import (
    AddendumCreate,
    EncounterCreate,
    EncounterRead,
    EncounterSummary,
    EncounterUpdate,
    IntegrityResult,
    PayloadWrite,
    SigningChecklist,
)

router = APIRouter(tags=["encuentros"])


@router.post("/encounters", response_model=EncounterRead, status_code=status.HTTP_201_CREATED)
async def create_encounter(
    body: EncounterCreate, actor: ClinicalWriter, service: EncounterServiceDep, context: ContextDep
) -> EncounterRead:
    return EncounterRead.model_validate(await service.create(actor, body, context))


@router.get("/patients/{patient_id}/encounters", response_model=list[EncounterSummary])
async def list_encounters(
    patient_id: uuid.UUID,
    actor: ClinicalReader,
    service: EncounterServiceDep,
    context: ContextDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[EncounterSummary]:
    rows = await service.list_for_patient(actor, patient_id, context, limit=limit, offset=offset)
    return [EncounterSummary.model_validate(r) for r in rows]


@router.get("/encounters/{encounter_id}", response_model=EncounterRead)
async def get_encounter(
    encounter_id: uuid.UUID,
    actor: ClinicalReader,
    service: EncounterServiceDep,
    context: ContextDep,
) -> EncounterRead:
    return EncounterRead.model_validate(await service.get(actor, encounter_id, context))


@router.patch("/encounters/{encounter_id}", response_model=EncounterRead)
async def update_encounter(
    encounter_id: uuid.UUID,
    body: EncounterUpdate,
    actor: ClinicalWriter,
    service: EncounterServiceDep,
    context: ContextDep,
) -> EncounterRead:
    return EncounterRead.model_validate(
        await service.update_draft(actor, encounter_id, body, context)
    )


@router.put("/encounters/{encounter_id}/specialty-payload", response_model=EncounterRead)
async def put_specialty_payload(
    encounter_id: uuid.UUID,
    body: PayloadWrite,
    actor: ClinicalWriter,
    service: EncounterServiceDep,
    context: ContextDep,
) -> EncounterRead:
    return EncounterRead.model_validate(
        await service.put_payload(actor, encounter_id, body, context)
    )


@router.get("/encounters/{encounter_id}/signing-checklist", response_model=SigningChecklist)
async def signing_checklist(
    encounter_id: uuid.UUID,
    actor: ClinicalReader,
    service: EncounterServiceDep,
    context: ContextDep,
) -> SigningChecklist:
    return await service.checklist(actor, encounter_id, context)


@router.post("/encounters/{encounter_id}/sign", response_model=EncounterRead)
async def sign_encounter(
    encounter_id: uuid.UUID,
    actor: ClinicalWriter,
    service: EncounterServiceDep,
    context: ContextDep,
) -> EncounterRead:
    return EncounterRead.model_validate(await service.sign(actor, encounter_id, context))


@router.post(
    "/encounters/{encounter_id}/addenda",
    response_model=EncounterRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_addendum(
    encounter_id: uuid.UUID,
    body: AddendumCreate,
    actor: ClinicalWriter,
    service: EncounterServiceDep,
    context: ContextDep,
) -> EncounterRead:
    return EncounterRead.model_validate(
        await service.add_addendum(actor, encounter_id, body, context)
    )


@router.get("/encounters/{encounter_id}/integrity", response_model=IntegrityResult)
async def verify_integrity(
    encounter_id: uuid.UUID,
    actor: ClinicalReader,
    service: EncounterServiceDep,
    context: ContextDep,
) -> IntegrityResult:
    return await service.verify_integrity(actor, encounter_id, context)
