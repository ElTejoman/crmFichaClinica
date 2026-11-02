"""Pacientes (datos administrativos) y su relación terapéutica con doctores."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import ContextDep, PatientServiceDep, PatientsManager, PatientsReader
from app.schemas.patients import (
    CareTeamAssign,
    CareTeamRead,
    DuplicateCandidate,
    PatientCreate,
    PatientRead,
    PatientSummary,
    PatientUpdate,
)

router = APIRouter(prefix="/patients", tags=["pacientes"])


@router.get("", response_model=list[PatientSummary])
async def search_patients(
    actor: PatientsReader,
    service: PatientServiceDep,
    q: Annotated[
        str | None, Query(max_length=100, description="Nombre, documento o teléfono")
    ] = None,
    include_inactive: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[PatientSummary]:
    patients = await service.search(
        actor, query=q, limit=limit, offset=offset, include_inactive=include_inactive
    )
    return [PatientSummary.model_validate(p) for p in patients]


@router.post("", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
async def create_patient(
    body: PatientCreate, actor: PatientsManager, service: PatientServiceDep, context: ContextDep
) -> PatientRead:
    return PatientRead.model_validate(await service.create_patient(actor, body, context))


# Rutas estáticas ANTES de `/{patient_id}`: si no, "duplicates" se interpretaría como un UUID.
@router.get("/duplicates", response_model=list[DuplicateCandidate])
async def possible_duplicates(
    _: PatientsManager,
    service: PatientServiceDep,
    first_name: Annotated[str, Query(min_length=1, max_length=100)],
    last_name: Annotated[str, Query(min_length=1, max_length=100)],
    birth_date: date | None = None,
    phone: Annotated[str | None, Query(max_length=30)] = None,
) -> list[DuplicateCandidate]:
    return await service.possible_duplicates(
        first_name=first_name, last_name=last_name, birth_date=birth_date, phone=phone
    )


@router.get("/{patient_id}", response_model=PatientRead)
async def get_patient(
    patient_id: uuid.UUID, actor: PatientsReader, service: PatientServiceDep, context: ContextDep
) -> PatientRead:
    return PatientRead.model_validate(await service.get_patient(actor, patient_id, context))


@router.patch("/{patient_id}", response_model=PatientRead)
async def update_patient(
    patient_id: uuid.UUID,
    body: PatientUpdate,
    actor: PatientsManager,
    service: PatientServiceDep,
    context: ContextDep,
) -> PatientRead:
    return PatientRead.model_validate(
        await service.update_patient(actor, patient_id, body, context)
    )


@router.get("/{patient_id}/care-team", response_model=list[CareTeamRead])
async def list_care_team(
    patient_id: uuid.UUID, _: PatientsManager, service: PatientServiceDep
) -> list[CareTeamRead]:
    return await service.list_care_team(patient_id)


@router.post(
    "/{patient_id}/care-team", response_model=CareTeamRead, status_code=status.HTTP_201_CREATED
)
async def assign_doctor(
    patient_id: uuid.UUID,
    body: CareTeamAssign,
    actor: PatientsManager,
    service: PatientServiceDep,
    context: ContextDep,
) -> CareTeamRead:
    return await service.assign_doctor(actor, patient_id, body.doctor_user_id, context)


@router.delete("/{patient_id}/care-team/{doctor_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def end_assignment(
    patient_id: uuid.UUID,
    doctor_user_id: uuid.UUID,
    actor: PatientsManager,
    service: PatientServiceDep,
    context: ContextDep,
) -> Response:
    await service.end_assignment(actor, patient_id, doctor_user_id, context)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
