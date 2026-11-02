"""Citas: agenda, series, disponibilidad, reprogramación y ciclo de estados."""

import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import (
    AgendaAttend,
    AgendaManager,
    AgendaReader,
    AppointmentServiceDep,
    ContextDep,
)
from app.domain.enums import AppointmentStatus, Specialty
from app.schemas.agenda import (
    AppointmentCreate,
    AppointmentRead,
    CancelBody,
    DoctorAvailability,
    RescheduleBody,
    SeriesCreate,
    SeriesResult,
)

router = APIRouter(prefix="/appointments", tags=["agenda"])


def _read(appointment: object) -> AppointmentRead:
    return AppointmentRead.model_validate(appointment)


@router.get("", response_model=list[AppointmentRead])
async def list_appointments(
    actor: AgendaReader,
    service: AppointmentServiceDep,
    starts_from: Annotated[datetime | None, Query(alias="from")] = None,
    starts_before: Annotated[datetime | None, Query(alias="to")] = None,
    doctor_id: uuid.UUID | None = None,
    specialty: Specialty | None = None,
    status_: Annotated[AppointmentStatus | None, Query(alias="status")] = None,
    patient_id: uuid.UUID | None = None,
    room_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[AppointmentRead]:
    rows = await service.list_appointments(
        actor,
        starts_from=starts_from,
        starts_before=starts_before,
        doctor_user_id=doctor_id,
        specialty=specialty.value if specialty else None,
        status=status_,
        patient_id=patient_id,
        room_id=room_id,
        limit=limit,
        offset=offset,
    )
    return [_read(r) for r in rows]


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    body: AppointmentCreate,
    actor: AgendaManager,
    service: AppointmentServiceDep,
    context: ContextDep,
) -> AppointmentRead:
    return _read(await service.create_appointment(actor, body, context))


@router.post("/series", response_model=SeriesResult, status_code=status.HTTP_201_CREATED)
async def create_series(
    body: SeriesCreate, actor: AgendaManager, service: AppointmentServiceDep, context: ContextDep
) -> SeriesResult:
    series_id, created = await service.create_series(actor, body, context)
    return SeriesResult(series_id=series_id, appointments=[_read(a) for a in created])


# Rutas estáticas ANTES de `/{appointment_id}`.
@router.get("/availability", response_model=list[DoctorAvailability])
async def availability(
    _: AgendaManager,
    service: AppointmentServiceDep,
    from_date: date,
    to_date: date,
    doctor_id: uuid.UUID | None = None,
    specialty: Specialty | None = None,
    duration_minutes: Annotated[int | None, Query(ge=5, le=240)] = None,
    appointment_type_id: uuid.UUID | None = None,
) -> list[DoctorAvailability]:
    return await service.availability(
        doctor_user_id=doctor_id,
        specialty=specialty,
        from_date=from_date,
        to_date=to_date,
        duration_minutes=duration_minutes,
        type_id=appointment_type_id,
    )


@router.get("/series/{series_id}", response_model=list[AppointmentRead])
async def get_series(
    series_id: uuid.UUID, actor: AgendaReader, service: AppointmentServiceDep, context: ContextDep
) -> list[AppointmentRead]:
    return [_read(a) for a in await service.list_series(actor, series_id, context)]


@router.get("/{appointment_id}", response_model=AppointmentRead)
async def get_appointment(
    appointment_id: uuid.UUID,
    actor: AgendaReader,
    service: AppointmentServiceDep,
    context: ContextDep,
) -> AppointmentRead:
    return _read(await service.get_appointment(actor, appointment_id, context))


@router.post("/{appointment_id}/confirm", response_model=AppointmentRead)
async def confirm(
    appointment_id: uuid.UUID,
    actor: AgendaManager,
    service: AppointmentServiceDep,
    context: ContextDep,
) -> AppointmentRead:
    return _read(await service.confirm(actor, appointment_id, context))


@router.post("/{appointment_id}/check-in", response_model=AppointmentRead)
async def check_in(
    appointment_id: uuid.UUID,
    actor: AgendaManager,
    service: AppointmentServiceDep,
    context: ContextDep,
) -> AppointmentRead:
    return _read(await service.check_in(actor, appointment_id, context))


@router.post("/{appointment_id}/cancel", response_model=AppointmentRead)
async def cancel(
    appointment_id: uuid.UUID,
    body: CancelBody,
    actor: AgendaManager,
    service: AppointmentServiceDep,
    context: ContextDep,
) -> AppointmentRead:
    return _read(await service.cancel(actor, appointment_id, body.reason, context))


@router.post("/{appointment_id}/no-show", response_model=AppointmentRead)
async def no_show(
    appointment_id: uuid.UUID,
    actor: AgendaManager,
    service: AppointmentServiceDep,
    context: ContextDep,
) -> AppointmentRead:
    return _read(await service.mark_no_show(actor, appointment_id, context))


@router.post("/{appointment_id}/reschedule", response_model=AppointmentRead)
async def reschedule(
    appointment_id: uuid.UUID,
    body: RescheduleBody,
    actor: AgendaManager,
    service: AppointmentServiceDep,
    context: ContextDep,
) -> AppointmentRead:
    return _read(await service.reschedule(actor, appointment_id, body, context))


@router.post("/{appointment_id}/start", response_model=AppointmentRead)
async def start(
    appointment_id: uuid.UUID,
    actor: AgendaAttend,
    service: AppointmentServiceDep,
    context: ContextDep,
) -> AppointmentRead:
    return _read(await service.start(actor, appointment_id, context))


@router.post("/{appointment_id}/complete", response_model=AppointmentRead)
async def complete(
    appointment_id: uuid.UUID,
    actor: AgendaAttend,
    service: AppointmentServiceDep,
    context: ContextDep,
) -> AppointmentRead:
    return _read(await service.complete(actor, appointment_id, context))
