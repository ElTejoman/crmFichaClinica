"""Casos de uso de pacientes y de la relación terapéutica.

Reglas clave:
- Se abre automáticamente UNA historia clínica por paciente (ADR-001).
- Menores de 18 años requieren apoderado; el consentimiento de datos es obligatorio.
- Un DOCTOR solo accede a pacientes con quienes tiene relación terapéutica activa.
- Toda lectura individual y escritura se audita con `patient_id` (derecho de acceso, Ley 29733).
"""

import uuid
from datetime import date

from app.core.clock import lima_today, utcnow
from app.core.config import Settings
from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.domain.enums import AuditAction, AuditOutcome, Role
from app.domain.patient_rules import (
    add_years,
    mask_document,
    normalize_phone,
    requires_guardian,
    validate_birth_date,
)
from app.domain.policies.permissions import sees_full_portfolio
from app.models.patient import Patient
from app.models.user import User
from app.repositories.care_team import CareTeamRepository
from app.repositories.errors import UniqueViolationError
from app.repositories.patients import PatientRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.users import UserRepository
from app.schemas.patients import (
    CareTeamRead,
    DuplicateCandidate,
    EmergencyContact,
    Guardian,
    PatientCreate,
    PatientUpdate,
)
from app.services.audit import AuditService, RequestContext

# Umbral de similitud de nombre (pg_trgm, 0-1) para sugerir un posible duplicado
# cuando además coincide la fecha de nacimiento.
MIN_NAME_SIMILARITY = 0.45
RESOURCE_PATIENT = "patient"
RESOURCE_CARE_TEAM = "care_team"

_GUARDIAN_REQUIRED = "El paciente es menor de edad: se requiere un apoderado"


class GuardianRequiredError(BusinessRuleError):
    code = "guardian_required"


class InvalidBirthDateError(BusinessRuleError):
    code = "invalid_birth_date"


class InvalidDoctorError(BusinessRuleError):
    code = "invalid_doctor"


class PatientService:
    def __init__(
        self,
        *,
        patients: PatientRepository,
        care_team: CareTeamRepository,
        users: UserRepository,
        audit: AuditService,
        uow: UnitOfWork,
        settings: Settings,
    ) -> None:
        self._patients = patients
        self._care_team = care_team
        self._users = users
        self._audit = audit
        self._uow = uow
        self._settings = settings

    # ------------------------------------------------------------------ alta
    async def create_patient(
        self, actor: User, data: PatientCreate, context: RequestContext, *, commit: bool = True
    ) -> Patient:
        """Crea paciente + historia clínica. `commit=False` lo usa la conversión de leads
        para que todo (paciente, historia, lead, auditoría) quede en una sola transacción."""
        today = lima_today()
        self._check_birth_and_guardian(data.birth_date, data.guardian is not None, today)

        existing = await self._patients.get_by_document(data.document_type, data.document_number)
        if existing is not None:
            raise self._document_conflict(existing)

        now = utcnow()
        try:
            patient = await self._patients.add(
                **self._columns_from(data),
                data_processing_consent_at=now,
                created_by=actor.id,
            )
        except UniqueViolationError:
            await self._uow.rollback()
            raise ConflictError(
                "Ya existe un paciente con ese documento",
                details={"code": "patient_document_exists"},
            ) from None

        await self._patients.open_history(
            patient,
            opened_at=now,
            retention_until=add_years(today, self._settings.retention_years),
        )
        await self._audit.record(
            AuditAction.CREATE,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_PATIENT,
            resource_id=str(patient.id),
            patient_id=patient.id,
            context=context,
        )
        if commit:
            await self._uow.commit()
        return patient

    @staticmethod
    def _document_conflict(existing: Patient) -> ConflictError:
        return ConflictError(
            "Ya existe un paciente con ese documento",
            details={
                "code": "patient_document_exists",
                "patient_id": str(existing.id),
                "full_name": existing.full_name,
            },
        )

    @staticmethod
    def _columns_from(data: PatientCreate) -> dict[str, object]:
        """Convierte el DTO (con objetos anidados) a columnas planas del modelo."""
        fields = data.model_dump(
            exclude={"emergency_contact", "guardian", "data_processing_consent"}, mode="python"
        )
        for key in ("document_type", "sex", "marital_status", "referral_source"):
            if fields.get(key) is not None:
                fields[key] = str(fields[key].value)  # enums → texto almacenado
        fields.update(_emergency_columns(data.emergency_contact))
        fields.update(_guardian_columns(data.guardian))
        return fields

    @staticmethod
    def _check_birth_and_guardian(birth_date: date, has_guardian: bool, today: date) -> None:
        try:
            validate_birth_date(birth_date, today)
        except ValueError as exc:
            raise InvalidBirthDateError(str(exc)) from exc
        if requires_guardian(birth_date, today) and not has_guardian:
            raise GuardianRequiredError(_GUARDIAN_REQUIRED)

    # --------------------------------------------------------------- lectura
    async def get_patient(
        self, actor: User, patient_id: uuid.UUID, context: RequestContext
    ) -> Patient:
        patient = await self._patients.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente no encontrado")
        await self._ensure_access(actor, patient, context)
        await self._audit.record(
            AuditAction.READ,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_PATIENT,
            resource_id=str(patient.id),
            patient_id=patient.id,
            context=context,
        )
        await self._uow.commit()
        return patient

    async def search(
        self,
        actor: User,
        *,
        query: str | None,
        limit: int,
        offset: int,
        include_inactive: bool = False,
    ) -> list[Patient]:
        """Listado/búsqueda. Un doctor solo ve su cartera. No se audita fila por fila (solo la
        lectura individual); la búsqueda devuelve únicamente datos mínimos de identificación."""
        return await self._patients.search(
            query=query,
            limit=limit,
            offset=offset,
            doctor_user_id=None if sees_full_portfolio(actor.role_names) else actor.id,
            include_inactive=include_inactive,
        )

    async def _ensure_access(self, actor: User, patient: Patient, context: RequestContext) -> None:
        if sees_full_portfolio(actor.role_names):
            return
        if await self._care_team.is_active_member(patient.id, actor.id):
            return
        # Sin relación terapéutica: se deniega y se audita (luego habrá break-glass, Fase 6).
        await self._audit.record(
            AuditAction.PERMISSION_DENIED,
            outcome=AuditOutcome.DENIED,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_PATIENT,
            resource_id=str(patient.id),
            patient_id=patient.id,
            reason="sin relación terapéutica",
            context=context,
        )
        await self._uow.commit()
        raise PermissionDeniedError("No tienes una relación terapéutica con este paciente")

    # ----------------------------------------------------------- duplicados
    async def possible_duplicates(
        self,
        *,
        first_name: str,
        last_name: str,
        birth_date: date | None,
        phone: str | None,
    ) -> list[DuplicateCandidate]:
        normalized_phone = _safe_phone(phone)
        matches = await self._patients.find_possible_duplicates(
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            birth_date=birth_date,
            phone=normalized_phone,
            min_similarity=MIN_NAME_SIMILARITY,
        )
        candidates: list[DuplicateCandidate] = []
        for match in matches:
            reasons = []
            if match.same_birth_date and match.name_similarity >= MIN_NAME_SIMILARITY:
                reasons.append("Mismo nombre aproximado y misma fecha de nacimiento")
            if match.same_phone:
                reasons.append("Mismo teléfono")
            candidates.append(
                DuplicateCandidate(
                    patient_id=match.patient.id,
                    full_name=match.patient.full_name,
                    birth_date=match.patient.birth_date,
                    document_type=match.patient.document_type,
                    document_number_masked=mask_document(match.patient.document_number),
                    name_similarity=round(match.name_similarity, 2),
                    reasons=reasons,
                )
            )
        return candidates

    # ------------------------------------------------------------ edición
    async def update_patient(
        self, actor: User, patient_id: uuid.UUID, data: PatientUpdate, context: RequestContext
    ) -> Patient:
        patient = await self._patients.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente no encontrado")
        changes = data.model_dump(exclude_unset=True)

        birth_date = changes.get("birth_date", patient.birth_date)
        guardian_after = changes.get("guardian", patient.guardian)
        self._check_birth_and_guardian(birth_date, guardian_after is not None, lima_today())

        for key, value in changes.items():
            if key in ("emergency_contact", "guardian"):
                continue  # objetos anidados: se aplican abajo a sus columnas planas
            setattr(patient, key, value.value if hasattr(value, "value") else value)
        if "emergency_contact" in changes:
            _apply(patient, _emergency_columns(data.emergency_contact))
        if "guardian" in changes:
            _apply(patient, _guardian_columns(data.guardian))

        await self._audit.record(
            AuditAction.UPDATE,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_PATIENT,
            resource_id=str(patient.id),
            patient_id=patient.id,
            # Solo NOMBRES de campos: los valores son datos personales y no van a la auditoría.
            reason="campos=" + (",".join(sorted(changes)) or "ninguno"),
            context=context,
        )
        await self._uow.commit()
        return patient

    # ------------------------------------------------- relación terapéutica
    async def assign_doctor(
        self, actor: User, patient_id: uuid.UUID, doctor_user_id: uuid.UUID, context: RequestContext
    ) -> CareTeamRead:
        patient = await self._patients.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente no encontrado")
        doctor = await self._users.get_by_id(doctor_user_id)
        if doctor is None or not doctor.is_active or Role.DOCTOR not in doctor.role_names:
            raise InvalidDoctorError("El usuario indicado no es un doctor activo")
        if await self._care_team.get_active(patient_id, doctor_user_id) is not None:
            raise ConflictError("El doctor ya está asignado a este paciente")

        member = await self._care_team.add(
            patient_id=patient_id,
            doctor_user_id=doctor_user_id,
            since=utcnow(),
            created_by=actor.id,
        )
        await self._audit.record(
            AuditAction.CREATE,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_CARE_TEAM,
            resource_id=str(member.id),
            patient_id=patient_id,
            context=context,
        )
        await self._uow.commit()
        return CareTeamRead(
            id=member.id,
            doctor_user_id=member.doctor_user_id,
            doctor_name=doctor.full_name,
            since=member.since,
            until=member.until,
        )

    async def end_assignment(
        self, actor: User, patient_id: uuid.UUID, doctor_user_id: uuid.UUID, context: RequestContext
    ) -> None:
        member = await self._care_team.get_active(patient_id, doctor_user_id)
        if member is None:
            raise NotFoundError("El doctor no tiene una asignación activa con este paciente")
        await self._care_team.end(member, utcnow())
        await self._audit.record(
            AuditAction.UPDATE,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_CARE_TEAM,
            resource_id=str(member.id),
            patient_id=patient_id,
            reason="asignación finalizada",
            context=context,
        )
        await self._uow.commit()

    async def list_care_team(self, patient_id: uuid.UUID) -> list[CareTeamRead]:
        if await self._patients.get(patient_id) is None:
            raise NotFoundError("Paciente no encontrado")
        result: list[CareTeamRead] = []
        for member in await self._care_team.list_for_patient(patient_id):
            doctor = await self._users.get_by_id(member.doctor_user_id)
            result.append(
                CareTeamRead(
                    id=member.id,
                    doctor_user_id=member.doctor_user_id,
                    doctor_name=doctor.full_name if doctor else "(usuario eliminado)",
                    since=member.since,
                    until=member.until,
                )
            )
        return result


# ----------------------------------------------------------------- helpers
def _safe_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return normalize_phone(raw)
    except ValueError:
        return None  # un teléfono inválido simplemente no aporta a la búsqueda de duplicados


def _apply(patient: Patient, columns: dict[str, object]) -> None:
    for key, value in columns.items():
        setattr(patient, key, value)


def _emergency_columns(contact: EmergencyContact | None) -> dict[str, object]:
    return {
        "emergency_contact_name": contact.name if contact else None,
        "emergency_contact_phone": contact.phone if contact else None,
        "emergency_contact_relation": contact.relation if contact else None,
    }


def _guardian_columns(guardian: Guardian | None) -> dict[str, object]:
    return {
        "guardian_name": guardian.name if guardian else None,
        "guardian_document_type": guardian.document_type.value if guardian else None,
        "guardian_document_number": guardian.document_number if guardian else None,
        "guardian_phone": guardian.phone if guardian else None,
        "guardian_relation": guardian.relation if guardian else None,
    }
