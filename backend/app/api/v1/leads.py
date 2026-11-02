"""CRM: posibles clientes (embudo, actividades, seguimientos, conversión y estadísticas)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import (
    ContextDep,
    LeadServiceDep,
    LeadsManager,
    LeadsReader,
    LeadsReports,
    PatientsManager,
)
from app.domain.enums import LeadSource, LeadStatus, Specialty
from app.schemas.leads import (
    LeadActivityCreate,
    LeadConversionResult,
    LeadConvert,
    LeadCreate,
    LeadRead,
    LeadStats,
    LeadSummary,
    LeadUpdate,
)

router = APIRouter(prefix="/leads", tags=["CRM"])


@router.get("", response_model=list[LeadSummary])
async def list_leads(
    actor: LeadsReader,
    service: LeadServiceDep,
    status_: Annotated[LeadStatus | None, Query(alias="status")] = None,
    source: LeadSource | None = None,
    specialty: Specialty | None = None,
    assigned_to: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[LeadSummary]:
    leads = await service.list_leads(
        actor,
        limit=limit,
        offset=offset,
        status=status_,
        source=source.value if source else None,
        assigned_to=assigned_to,
        specialty=specialty.value if specialty else None,
        query=q,
    )
    return [LeadSummary.model_validate(x) for x in leads]


@router.post("", response_model=LeadRead, status_code=status.HTTP_201_CREATED)
async def create_lead(
    body: LeadCreate,
    actor: LeadsManager,
    service: LeadServiceDep,
    context: ContextDep,
    allow_duplicate: bool = False,
) -> LeadRead:
    lead = await service.create_lead(actor, body, context, allow_duplicate=allow_duplicate)
    return LeadRead.model_validate(lead)


# Rutas estáticas ANTES de `/{lead_id}`.
@router.get("/followups", response_model=list[LeadSummary])
async def due_followups(actor: LeadsReader, service: LeadServiceDep) -> list[LeadSummary]:
    """Seguimientos de hoy: próxima acción vencida o que vence hoy (hora de Lima)."""
    return [LeadSummary.model_validate(x) for x in await service.due_followups(actor)]


@router.get("/stats", response_model=LeadStats)
async def lead_stats(_: LeadsReports, service: LeadServiceDep) -> LeadStats:
    return await service.stats()


@router.get("/{lead_id}", response_model=LeadRead)
async def get_lead(
    lead_id: uuid.UUID, actor: LeadsReader, service: LeadServiceDep, context: ContextDep
) -> LeadRead:
    return LeadRead.model_validate(await service.get_lead(actor, lead_id, context))


@router.patch("/{lead_id}", response_model=LeadRead)
async def update_lead(
    lead_id: uuid.UUID,
    body: LeadUpdate,
    actor: LeadsManager,
    service: LeadServiceDep,
    context: ContextDep,
) -> LeadRead:
    return LeadRead.model_validate(await service.update_lead(actor, lead_id, body, context))


@router.post("/{lead_id}/activities", response_model=LeadRead, status_code=status.HTTP_201_CREATED)
async def add_activity(
    lead_id: uuid.UUID,
    body: LeadActivityCreate,
    actor: LeadsManager,
    service: LeadServiceDep,
    context: ContextDep,
) -> LeadRead:
    return LeadRead.model_validate(await service.add_activity(actor, lead_id, body, context))


@router.post("/{lead_id}/convert", response_model=LeadConversionResult)
async def convert_to_patient(
    lead_id: uuid.UUID,
    body: LeadConvert,
    actor: LeadsManager,
    _patients: PatientsManager,  # convertir crea un paciente: exige también ese permiso
    service: LeadServiceDep,
    context: ContextDep,
) -> LeadConversionResult:
    lead, patient_id, hc_number = await service.convert_to_patient(actor, lead_id, body, context)
    return LeadConversionResult(
        lead=LeadRead.model_validate(lead), patient_id=patient_id, hc_number=hc_number
    )
