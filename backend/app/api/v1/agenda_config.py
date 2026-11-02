"""Configuración de la agenda: horarios, excepciones, salas y tipos de cita."""

import uuid
from datetime import date

from fastapi import APIRouter, Response, status

from app.api.deps import AgendaReader, ContextDep, ScheduleManager, ScheduleServiceDep
from app.domain.enums import Specialty
from app.schemas.agenda import (
    AppointmentTypeCreate,
    AppointmentTypeRead,
    AppointmentTypeUpdate,
    ExceptionCreate,
    ExceptionCreated,
    ExceptionRead,
    RoomCreate,
    RoomRead,
    RoomUpdate,
    WorkingBlockCreate,
    WorkingBlockRead,
    WorkingBlockUpdate,
)

router = APIRouter(tags=["agenda (configuración)"])


# ------------------------------------------------------------------ horarios
@router.get("/schedules", response_model=list[WorkingBlockRead])
async def list_schedules(
    _: AgendaReader,
    service: ScheduleServiceDep,
    doctor_id: uuid.UUID | None = None,
    include_inactive: bool = False,
) -> list[WorkingBlockRead]:
    blocks = await service.list_blocks(doctor_user_id=doctor_id, include_inactive=include_inactive)
    return [WorkingBlockRead.model_validate(b) for b in blocks]


@router.post("/schedules", response_model=WorkingBlockRead, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: WorkingBlockCreate,
    actor: ScheduleManager,
    service: ScheduleServiceDep,
    context: ContextDep,
) -> WorkingBlockRead:
    return WorkingBlockRead.model_validate(await service.create_block(actor, body, context))


@router.patch("/schedules/{schedule_id}", response_model=WorkingBlockRead)
async def update_schedule(
    schedule_id: uuid.UUID,
    body: WorkingBlockUpdate,
    actor: ScheduleManager,
    service: ScheduleServiceDep,
    context: ContextDep,
) -> WorkingBlockRead:
    return WorkingBlockRead.model_validate(
        await service.update_block(actor, schedule_id, body, context)
    )


# -------------------------------------------------------------- excepciones
@router.get("/schedule-exceptions", response_model=list[ExceptionRead])
async def list_exceptions(
    _: AgendaReader,
    service: ScheduleServiceDep,
    doctor_id: uuid.UUID | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[ExceptionRead]:
    rows = await service.list_exceptions(
        doctor_user_id=doctor_id, from_date=from_date, to_date=to_date
    )
    return [ExceptionRead.model_validate(r) for r in rows]


@router.post(
    "/schedule-exceptions", response_model=ExceptionCreated, status_code=status.HTTP_201_CREATED
)
async def create_exception(
    body: ExceptionCreate, actor: ScheduleManager, service: ScheduleServiceDep, context: ContextDep
) -> ExceptionCreated:
    created, affected = await service.create_exception(actor, body, context)
    return ExceptionCreated(
        **ExceptionRead.model_validate(created).model_dump(), affected_appointments=affected
    )


@router.delete("/schedule-exceptions/{exception_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exception(
    exception_id: uuid.UUID,
    actor: ScheduleManager,
    service: ScheduleServiceDep,
    context: ContextDep,
) -> Response:
    await service.delete_exception(actor, exception_id, context)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------- salas
@router.get("/rooms", response_model=list[RoomRead])
async def list_rooms(
    _: AgendaReader, service: ScheduleServiceDep, include_inactive: bool = False
) -> list[RoomRead]:
    return [
        RoomRead.model_validate(r)
        for r in await service.list_rooms(include_inactive=include_inactive)
    ]


@router.post("/rooms", response_model=RoomRead, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreate, actor: ScheduleManager, service: ScheduleServiceDep, context: ContextDep
) -> RoomRead:
    return RoomRead.model_validate(await service.create_room(actor, body, context))


@router.patch("/rooms/{room_id}", response_model=RoomRead)
async def update_room(
    room_id: uuid.UUID,
    body: RoomUpdate,
    actor: ScheduleManager,
    service: ScheduleServiceDep,
    context: ContextDep,
) -> RoomRead:
    return RoomRead.model_validate(await service.update_room(actor, room_id, body, context))


# ------------------------------------------------------------ tipos de cita
@router.get("/appointment-types", response_model=list[AppointmentTypeRead])
async def list_types(
    _: AgendaReader,
    service: ScheduleServiceDep,
    specialty: Specialty | None = None,
    include_inactive: bool = False,
) -> list[AppointmentTypeRead]:
    rows = await service.list_types(
        specialty=specialty.value if specialty else None, include_inactive=include_inactive
    )
    return [AppointmentTypeRead.model_validate(r) for r in rows]


@router.post(
    "/appointment-types", response_model=AppointmentTypeRead, status_code=status.HTTP_201_CREATED
)
async def create_type(
    body: AppointmentTypeCreate,
    actor: ScheduleManager,
    service: ScheduleServiceDep,
    context: ContextDep,
) -> AppointmentTypeRead:
    return AppointmentTypeRead.model_validate(await service.create_type(actor, body, context))


@router.patch("/appointment-types/{type_id}", response_model=AppointmentTypeRead)
async def update_type(
    type_id: uuid.UUID,
    body: AppointmentTypeUpdate,
    actor: ScheduleManager,
    service: ScheduleServiceDep,
    context: ContextDep,
) -> AppointmentTypeRead:
    return AppointmentTypeRead.model_validate(
        await service.update_type(actor, type_id, body, context)
    )
