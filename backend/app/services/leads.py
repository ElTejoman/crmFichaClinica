"""Casos de uso del CRM de posibles clientes (leads).

Reglas clave (docs/07 §1):
- Embudo con transiciones validadas en el dominio; `LOST` exige motivo y `CONVERTED` solo
  se alcanza por conversión.
- Un primer contacto registrado (llamada/WhatsApp/correo) mueve un lead NUEVO a CONTACTADO.
- La conversión crea paciente + historia clínica + cierra el lead en UNA transacción.
- Un DOCTOR solo ve los leads que se le asignaron.
"""

import uuid

from app.core.clock import lima_end_of_today, utcnow
from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.domain.enums import (
    AuditAction,
    AuditOutcome,
    LeadActivityType,
    LeadSource,
    LeadStatus,
    Role,
)
from app.domain.lead_funnel import InvalidLeadTransitionError, validate_transition
from app.domain.policies.permissions import sees_full_portfolio
from app.models.lead import Lead
from app.models.user import User
from app.repositories.leads import LeadRepository
from app.repositories.patients import PatientRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.users import UserRepository
from app.schemas.leads import (
    LeadActivityCreate,
    LeadConvert,
    LeadCreate,
    LeadStats,
    LeadUpdate,
)
from app.services.audit import AuditService, RequestContext
from app.services.patients import PatientService

RESOURCE_LEAD = "lead"
_FIRST_CONTACT_TYPES = frozenset(
    {LeadActivityType.CALL, LeadActivityType.WHATSAPP, LeadActivityType.EMAIL}
)


class InvalidLeadTransitionHttpError(BusinessRuleError):
    code = "invalid_lead_transition"


class InvalidAssigneeError(BusinessRuleError):
    code = "invalid_assignee"


class LeadService:
    def __init__(
        self,
        *,
        leads: LeadRepository,
        patients: PatientRepository,
        patient_service: PatientService,
        users: UserRepository,
        audit: AuditService,
        uow: UnitOfWork,
    ) -> None:
        self._leads = leads
        self._patients = patients
        self._patient_service = patient_service
        self._users = users
        self._audit = audit
        self._uow = uow

    # ------------------------------------------------------------------ alta
    async def create_lead(
        self, actor: User, data: LeadCreate, context: RequestContext, *, allow_duplicate: bool
    ) -> Lead:
        if not allow_duplicate:
            await self._raise_if_duplicate(phone=data.phone, email=data.email)
        await self._ensure_valid_assignee(data.assigned_to)

        lead = await self._leads.add(
            full_name=data.full_name,
            phone=data.phone,
            email=data.email,
            interest_specialties=sorted(s.value for s in data.interest_specialties),
            source=data.source.value,
            status=LeadStatus.NEW.value,
            status_changed_at=utcnow(),
            consent_marketing=data.consent_marketing,
            assigned_to=data.assigned_to,
            notes=data.notes,
            created_by=actor.id,
        )
        await self._record(AuditAction.CREATE, actor, lead, context)
        await self._uow.commit()
        return lead

    async def _raise_if_duplicate(self, *, phone: str | None, email: str | None) -> None:
        leads = await self._leads.find_duplicates(phone=phone, email=email)
        patients = await self._patients.find_by_contact(phone=phone, email=email)
        if leads or patients:
            raise ConflictError(
                "Ya existe un lead o paciente con ese teléfono o correo",
                details={
                    "code": "possible_duplicate",
                    "leads": [
                        {"id": str(x.id), "full_name": x.full_name, "status": x.status}
                        for x in leads
                    ],
                    "patients": [{"id": str(p.id), "full_name": p.full_name} for p in patients],
                },
            )

    async def _ensure_valid_assignee(self, user_id: uuid.UUID | None) -> None:
        if user_id is None:
            return
        user = await self._users.get_by_id(user_id)
        staff = {Role.OWNER, Role.DOCTOR, Role.RECEPTION}
        if user is None or not user.is_active or not staff.intersection(user.role_names):
            raise InvalidAssigneeError(
                "El responsable asignado no es personal activo de la clínica"
            )

    # --------------------------------------------------------------- lectura
    async def list_leads(
        self,
        actor: User,
        *,
        limit: int,
        offset: int,
        status: LeadStatus | None = None,
        source: str | None = None,
        assigned_to: uuid.UUID | None = None,
        specialty: str | None = None,
        query: str | None = None,
    ) -> list[Lead]:
        return await self._leads.list_leads(
            limit=limit,
            offset=offset,
            status=status.value if status else None,
            source=source,
            assigned_to=assigned_to,
            specialty=specialty,
            query=query,
            restrict_assigned_to=self._restriction(actor),
        )

    async def get_lead(self, actor: User, lead_id: uuid.UUID, context: RequestContext) -> Lead:
        lead = await self._leads.get(lead_id)
        if lead is None:
            raise NotFoundError("Lead no encontrado")
        await self._ensure_visible(actor, lead, context)
        return lead

    async def due_followups(self, actor: User) -> list[Lead]:
        """ "Seguimientos de hoy": próxima acción vencida o que vence hoy (hora de Lima)."""
        return await self._leads.due_followups(
            due_before=lima_end_of_today(), restrict_assigned_to=self._restriction(actor)
        )

    @staticmethod
    def _restriction(actor: User) -> uuid.UUID | None:
        return None if sees_full_portfolio(actor.role_names) else actor.id

    async def _ensure_visible(self, actor: User, lead: Lead, context: RequestContext) -> None:
        if sees_full_portfolio(actor.role_names) or lead.assigned_to == actor.id:
            return
        await self._audit.record(
            AuditAction.PERMISSION_DENIED,
            outcome=AuditOutcome.DENIED,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_LEAD,
            resource_id=str(lead.id),
            reason="lead no asignado",
            context=context,
        )
        await self._uow.commit()
        raise PermissionDeniedError("Este lead no está asignado a ti")

    # ------------------------------------------------------------ edición
    async def update_lead(
        self, actor: User, lead_id: uuid.UUID, data: LeadUpdate, context: RequestContext
    ) -> Lead:
        lead = await self._require(lead_id)
        changes = data.model_dump(exclude_unset=True)

        if "assigned_to" in changes:
            await self._ensure_valid_assignee(changes["assigned_to"])
        if "status" in changes and changes["status"] is not None:
            await self._change_status(
                actor,
                lead,
                LeadStatus(changes["status"]),
                changes.get("lost_reason", lead.lost_reason),
            )
        elif "lost_reason" in changes:
            lead.lost_reason = changes["lost_reason"]

        plain = (
            "full_name",
            "phone",
            "email",
            "source",
            "consent_marketing",
            "assigned_to",
            "notes",
        )
        for key in plain:
            if key in changes:
                value = changes[key]
                setattr(lead, key, value.value if hasattr(value, "value") else value)
        if "interest_specialties" in changes and changes["interest_specialties"] is not None:
            lead.interest_specialties = sorted(s.value for s in changes["interest_specialties"])

        await self._record(
            AuditAction.UPDATE,
            actor,
            lead,
            context,
            reason="campos=" + (",".join(sorted(changes)) or "ninguno"),
        )
        await self._uow.commit()
        return lead

    async def _change_status(
        self, actor: User, lead: Lead, target: LeadStatus, lost_reason: str | None
    ) -> None:
        current = LeadStatus(lead.status)
        try:
            validate_transition(current, target, lost_reason)
        except InvalidLeadTransitionError as exc:
            raise InvalidLeadTransitionHttpError(str(exc)) from exc
        if current == target:
            return
        lead.status = target.value
        lead.status_changed_at = utcnow()
        lead.lost_reason = (
            lost_reason.strip() if target == LeadStatus.LOST and lost_reason else None
        )
        if target == LeadStatus.LOST:
            lead.next_action_at = None  # un lead perdido no genera seguimientos
        await self._leads.add_activity(
            lead,
            type_=LeadActivityType.STATUS_CHANGE.value,
            notes=f"{current.value} → {target.value}",
            next_action_at=None,
            created_by=actor.id,
        )

    # ---------------------------------------------------------- actividades
    async def add_activity(
        self, actor: User, lead_id: uuid.UUID, data: LeadActivityCreate, context: RequestContext
    ) -> Lead:
        lead = await self._require(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise BusinessRuleError("El lead ya es paciente: registre el seguimiento en su ficha")
        await self._leads.add_activity(
            lead,
            type_=data.type.value,
            notes=data.notes,
            next_action_at=data.next_action_at,
            created_by=actor.id,
        )
        lead.next_action_at = data.next_action_at  # None limpia el pendiente anterior
        if lead.status == LeadStatus.NEW and data.type in _FIRST_CONTACT_TYPES:
            await self._change_status(actor, lead, LeadStatus.CONTACTED, None)
        await self._record(
            AuditAction.UPDATE, actor, lead, context, reason=f"actividad={data.type.value}"
        )
        await self._uow.commit()
        return lead

    # ------------------------------------------------------------ conversión
    async def convert_to_patient(
        self, actor: User, lead_id: uuid.UUID, data: LeadConvert, context: RequestContext
    ) -> tuple[Lead, uuid.UUID, int | None]:
        lead = await self._require(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise ConflictError("Este lead ya fue convertido en paciente")

        patient_data = data.patient
        if patient_data.referral_source is None:
            # La fuente comercial del lead se conserva como origen del paciente (métricas).
            patient_data = patient_data.model_copy(
                update={"referral_source": LeadSource(lead.source)}
            )
        patient = await self._patient_service.create_patient(
            actor, patient_data, context, commit=False
        )

        lead.status = LeadStatus.CONVERTED.value
        lead.status_changed_at = utcnow()
        lead.converted_patient_id = patient.id
        lead.next_action_at = None
        lead.lost_reason = None
        await self._leads.add_activity(
            lead,
            type_=LeadActivityType.STATUS_CHANGE.value,
            notes="Convertido en paciente",
            next_action_at=None,
            created_by=actor.id,
        )
        await self._record(AuditAction.UPDATE, actor, lead, context, reason="convertido a paciente")
        await self._uow.commit()  # lead + paciente + historia + auditoría: todo o nada
        return lead, patient.id, patient.hc_number

    # ----------------------------------------------------------- estadísticas
    async def stats(self) -> LeadStats:
        by_status = await self._leads.counts_by("status")
        total = sum(by_status.values())
        converted = by_status.get(LeadStatus.CONVERTED.value, 0)
        return LeadStats(
            total=total,
            open=await self._leads.count_open(),
            converted=converted,
            lost=by_status.get(LeadStatus.LOST.value, 0),
            conversion_rate=round(converted / total, 4) if total else 0.0,
            by_status=by_status,
            by_source=await self._leads.counts_by("source"),
            by_specialty=await self._leads.counts_by_specialty(),
            lost_reasons=await self._leads.counts_by("lost_reason"),
        )

    # --------------------------------------------------------------- internos
    async def _require(self, lead_id: uuid.UUID) -> Lead:
        lead = await self._leads.get(lead_id)
        if lead is None:
            raise NotFoundError("Lead no encontrado")
        return lead

    async def _record(
        self,
        action: AuditAction,
        actor: User,
        lead: Lead,
        context: RequestContext,
        *,
        reason: str | None = None,
    ) -> None:
        await self._audit.record(
            action,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_LEAD,
            resource_id=str(lead.id),
            reason=reason,
            context=context,
        )
