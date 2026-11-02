"""Gestión de usuarios (SUPERUSER y OWNER)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import ContextDep, UserServiceDep, UsersManager, UsersReader
from app.schemas.users import UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["usuarios"])


@router.get("", response_model=list[UserRead])
async def list_users(
    _: UsersReader,
    service: UserServiceDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[UserRead]:
    users = await service.list_users(limit=limit, offset=offset)
    return [UserRead.model_validate(u) for u in users]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate, actor: UsersManager, service: UserServiceDep, context: ContextDep
) -> UserRead:
    return UserRead.model_validate(await service.create_user(actor, body, context))


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: uuid.UUID, _: UsersReader, service: UserServiceDep) -> UserRead:
    return UserRead.model_validate(await service.get_user(user_id))


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    actor: UsersManager,
    service: UserServiceDep,
    context: ContextDep,
) -> UserRead:
    return UserRead.model_validate(await service.update_user(actor, user_id, body, context))
