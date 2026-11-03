"""Control de acceso y auditoría compartidos por TODO el contenido clínico.

Reglas (docs/04 §3):
- LECTURA: el OWNER lee todo; un DOCTOR solo a pacientes con relación terapéutica ACTIVA.
  Recepción y superusuario nunca leen contenido clínico (ni siquiera llegan aquí: el router
  exige `clinical:read`).
- ESCRITURA: solo un DOCTOR, con relación terapéutica activa, y solo en especialidades que ofrece.
- Toda denegación se audita con `patient_id`. (Break-glass: Fase 6.)
"""

import uuid
from typing import NoReturn

from app.core.errors import NotFoundError, PermissionDeniedError
from app.domain.enums import AuditAction, AuditOutcome, Role, Specialty
from app.models.patient import Patient
from app.models.user import User
from app.repositories.care_team import CareTeamRepository
from app.repositories.patients import PatientRepository
from app.repositories.unit_of_work import UnitOfWork
from app.services.appointments import PatientInactiveError
from app.services.audit import AuditService, RequestContext


class ClinicalAccess:
    def __init__(
        self,
        *,
        patients: PatientRepository,
        care_team: CareTeamRepository,
        audit: AuditService,
        uow: UnitOfWork,
    ) -> None:
        self._patients = patients
        self._care_team = care_team
        self._audit = audit
        self._uow = uow

    async def patient_for_read(
        self, actor: User, patient_id: uuid.UUID, context: RequestContext
    ) -> Patient:
        patient = await self._require(patient_id)
        if Role.OWNER in actor.role_names:
            return patient
        if await self._care_team.is_active_member(patient.id, actor.id):
            return patient
        await self.deny(actor, patient.id, "sin relación terapéutica (clínico)", context)

    async def patient_for_write(
        self,
        actor: User,
        patient_id: uuid.UUID,
        specialty: Specialty | None,
        context: RequestContext,
    ) -> Patient:
        patient = await self._require(patient_id)
        if Role.DOCTOR not in actor.role_names:
            await self.deny(actor, patient.id, "escritura clínica sin rol de doctor", context)
        if specialty is not None:
            offered = actor.doctor_profile.specialty_names if actor.doctor_profile else []
            if specialty not in offered:
                await self.deny(actor, patient.id, "especialidad no asignada al doctor", context)
        if not await self._care_team.is_active_member(patient.id, actor.id):
            await self.deny(actor, patient.id, "sin relación terapéutica (escritura)", context)
        if not patient.is_active:
            raise PatientInactiveError("El paciente está archivado: reactívelo para registrar")
        return patient

    async def _require(self, patient_id: uuid.UUID) -> Patient:
        patient = await self._patients.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente no encontrado")
        return patient

    async def deny(
        self, actor: User, patient_id: uuid.UUID, reason: str, context: RequestContext
    ) -> NoReturn:
        """Audita la denegación, la confirma y lanza 403 (nunca regresa)."""
        await self._audit.record(
            AuditAction.PERMISSION_DENIED,
            outcome=AuditOutcome.DENIED,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type="clinical",
            patient_id=patient_id,
            reason=reason,
            context=context,
        )
        await self._uow.commit()
        raise PermissionDeniedError("No tienes acceso al contenido clínico de este paciente")

    async def record(
        self,
        action: AuditAction,
        actor: User,
        patient_id: uuid.UUID,
        resource_type: str,
        resource_id: uuid.UUID | None,
        context: RequestContext,
        *,
        reason: str | None = None,
    ) -> None:
        """Auditoría de lectura/escritura clínica. `reason` = códigos del sistema, NUNCA
        contenido clínico ni datos personales."""
        await self._audit.record(
            action,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            patient_id=patient_id,
            reason=reason,
            context=context,
        )
