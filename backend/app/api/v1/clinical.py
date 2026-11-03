"""Resumen clínico, antecedentes (alergias, medicación, condiciones) y búsqueda CIE-10."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import ClinicalHistoryServiceDep, ClinicalReader, ClinicalWriter, ContextDep
from app.schemas.clinical import (
    AllergyCreate,
    AllergyRead,
    AllergyUpdate,
    ClinicalSummary,
    ConditionCreate,
    ConditionRead,
    ConditionUpdate,
    Icd10Read,
    MedicationCreate,
    MedicationRead,
    MedicationUpdate,
)

router = APIRouter(tags=["clínico"])


@router.get("/patients/{patient_id}/clinical-summary", response_model=ClinicalSummary)
async def clinical_summary(
    patient_id: uuid.UUID,
    actor: ClinicalReader,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
) -> ClinicalSummary:
    return await service.summary(actor, patient_id, context)


# ---------------------------------------------------------------- alergias
@router.get("/patients/{patient_id}/allergies", response_model=list[AllergyRead])
async def list_allergies(
    patient_id: uuid.UUID,
    actor: ClinicalReader,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
    include_inactive: bool = False,
) -> list[AllergyRead]:
    rows = await service.list_allergies(
        actor, patient_id, context, include_inactive=include_inactive
    )
    return [AllergyRead.model_validate(r) for r in rows]


@router.post(
    "/patients/{patient_id}/allergies",
    response_model=AllergyRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_allergy(
    patient_id: uuid.UUID,
    body: AllergyCreate,
    actor: ClinicalWriter,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
) -> AllergyRead:
    return AllergyRead.model_validate(await service.add_allergy(actor, patient_id, body, context))


@router.patch("/allergies/{allergy_id}", response_model=AllergyRead)
async def update_allergy(
    allergy_id: uuid.UUID,
    body: AllergyUpdate,
    actor: ClinicalWriter,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
) -> AllergyRead:
    return AllergyRead.model_validate(
        await service.update_allergy(actor, allergy_id, body, context)
    )


# -------------------------------------------------------------- medicación
@router.get("/patients/{patient_id}/medications", response_model=list[MedicationRead])
async def list_medications(
    patient_id: uuid.UUID,
    actor: ClinicalReader,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
    include_inactive: bool = False,
) -> list[MedicationRead]:
    rows = await service.list_medications(
        actor, patient_id, context, include_inactive=include_inactive
    )
    return [MedicationRead.model_validate(r) for r in rows]


@router.post(
    "/patients/{patient_id}/medications",
    response_model=MedicationRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_medication(
    patient_id: uuid.UUID,
    body: MedicationCreate,
    actor: ClinicalWriter,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
) -> MedicationRead:
    return MedicationRead.model_validate(
        await service.add_medication(actor, patient_id, body, context)
    )


@router.patch("/medications/{medication_id}", response_model=MedicationRead)
async def update_medication(
    medication_id: uuid.UUID,
    body: MedicationUpdate,
    actor: ClinicalWriter,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
) -> MedicationRead:
    return MedicationRead.model_validate(
        await service.update_medication(actor, medication_id, body, context)
    )


# ------------------------------------------------------------- antecedentes
@router.get("/patients/{patient_id}/conditions", response_model=list[ConditionRead])
async def list_conditions(
    patient_id: uuid.UUID,
    actor: ClinicalReader,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
    include_inactive: bool = False,
) -> list[ConditionRead]:
    rows = await service.list_conditions(
        actor, patient_id, context, include_inactive=include_inactive
    )
    return [ConditionRead.model_validate(r) for r in rows]


@router.post(
    "/patients/{patient_id}/conditions",
    response_model=ConditionRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_condition(
    patient_id: uuid.UUID,
    body: ConditionCreate,
    actor: ClinicalWriter,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
) -> ConditionRead:
    return ConditionRead.model_validate(
        await service.add_condition(actor, patient_id, body, context)
    )


@router.patch("/conditions/{condition_id}", response_model=ConditionRead)
async def update_condition(
    condition_id: uuid.UUID,
    body: ConditionUpdate,
    actor: ClinicalWriter,
    service: ClinicalHistoryServiceDep,
    context: ContextDep,
) -> ConditionRead:
    return ConditionRead.model_validate(
        await service.update_condition(actor, condition_id, body, context)
    )


# ------------------------------------------------------------------- CIE-10
@router.get("/icd10", response_model=list[Icd10Read])
async def search_icd10(
    _: ClinicalReader,
    service: ClinicalHistoryServiceDep,
    q: Annotated[str, Query(max_length=100, description="Código o texto")] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
) -> list[Icd10Read]:
    return [Icd10Read.model_validate(r) for r in await service.search_icd10(q, limit=limit)]
