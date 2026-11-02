"""DTOs de auditoría."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ts: datetime
    actor_user_id: uuid.UUID | None
    actor_roles: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    patient_id: uuid.UUID | None
    outcome: str
    reason: str | None


class ChainVerification(BaseModel):
    valid: bool
    checked: int
    first_broken_id: int | None
