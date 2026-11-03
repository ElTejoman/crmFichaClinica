"""Encuentros clínicos (SOAP): borrador, checklist de firma, firma, adendas e integridad.

Reglas clave (docs/01 §2-3, docs/05, CLAUDE.md §7):
- Solo el AUTOR edita su borrador. Un BORRADOR solo lo ve su autor.
- Firmar exige un checklist completo (fuente única de verdad: `domain.clinical_rules`).
- Al firmar se congela un SHA-256 del contenido canónico (vitales, diagnósticos, módulo, firma y
  sello del doctor). Firmado = inmutable: solo adendas (y un trigger de BD lo refuerza).
- Crear el encuentro desde una cita la pasa a "en atención"; firmar la pasa a "completada".
- Toda lectura/escritura se audita con `patient_id` y códigos (jamás contenido clínico).
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from pydantic import ValidationError

from app.core.clock import lima_today, utcnow
from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    NotFoundError,
)
from app.domain.agenda_rules import AgendaRuleError, clinic_date, validate_transition
from app.domain.clinical_rules import (
    ClinicalRuleError,
    MissingItem,
    SigningInput,
    calculate_bmi,
    can_add_addendum,
    can_edit,
    compute_content_hash,
    has_any_vital,
    normalize_icd10,
    required_consents_missing,
    signing_checklist,
    validate_vitals,
    verify_content_hash,
)
from app.domain.enums import (
    AppointmentStatus,
    AuditAction,
    ConsentType,
    EncounterStatus,
    Specialty,
)
from app.domain.specialties import registry
from app.models.clinical import Encounter
from app.models.user import User
from app.repositories.appointments import AppointmentRepository
from app.repositories.clinical_records import ClinicalRecordRepository
from app.repositories.consents import ConsentRepository
from app.repositories.encounters import EncounterRepository
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.clinical import (
    AddendumCreate,
    DiagnosisIn,
    EncounterCreate,
    EncounterUpdate,
    IntegrityResult,
    MissingItemRead,
    PayloadWrite,
    SigningChecklist,
    VitalSignsIn,
)
from app.services.audit import RequestContext
from app.services.clinical_access import ClinicalAccess

RESOURCE_ENCOUNTER = "encounter"
_VITAL_FIELDS = (
    "systolic",
    "diastolic",
    "heart_rate",
    "resp_rate",
    "temperature_c",
    "spo2",
    "weight_kg",
    "height_cm",
    "pain_vas",
)
# Valores con 1 decimal en BD: se redondean ANTES de guardar para que el hash sea estable.
_ONE_DECIMAL = ("temperature_c", "weight_kg", "height_cm")


class EncounterNotEditableError(ConflictError):
    code = "encounter_not_editable"


class EncounterExistsError(ConflictError):
    code = "encounter_exists"


class AppointmentNotReadyError(BusinessRuleError):
    code = "appointment_not_ready"


class InvalidVitalsError(BusinessRuleError):
    code = "invalid_vitals"


class InvalidDiagnosisError(BusinessRuleError):
    code = "invalid_diagnosis"


class SigningBlockedError(BusinessRuleError):
    code = "signing_blocked"


class NotSignedError(ConflictError):
    code = "encounter_not_signed"


class SpecialtyModuleUnavailableError(BusinessRuleError):
    code = "specialty_module_unavailable"


class InvalidPayloadError(BusinessRuleError):
    code = "invalid_specialty_payload"


class EncounterService:
    def __init__(
        self,
        *,
        encounters: EncounterRepository,
        appointments: AppointmentRepository,
        consents: ConsentRepository,
        records: ClinicalRecordRepository,
        access: ClinicalAccess,
        uow: UnitOfWork,
    ) -> None:
        self._encounters = encounters
        self._appointments = appointments
        self._consents = consents
        self._records = records
        self._access = access
        self._uow = uow

    # ------------------------------------------------------------------- crear
    async def create(
        self, actor: User, data: EncounterCreate, context: RequestContext
    ) -> Encounter:
        appointment = None
        if data.appointment_id is not None:
            appointment = await self._appointments.get(data.appointment_id)
            if appointment is None:
                raise NotFoundError("Cita no encontrada")
            patient_id, specialty = appointment.patient_id, Specialty(appointment.specialty)
        else:
            if data.patient_id is None or data.specialty is None:  # el DTO ya lo impide
                raise BusinessRuleError("Indique una cita o bien paciente y especialidad")
            patient_id, specialty = data.patient_id, data.specialty

        patient = await self._access.patient_for_write(actor, patient_id, specialty, context)

        if appointment is not None:
            if appointment.doctor_user_id != actor.id:
                await self._access.deny(actor, patient.id, "cita de otro doctor", context)
            if AppointmentStatus(appointment.status) not in (
                AppointmentStatus.CHECKED_IN,
                AppointmentStatus.IN_PROGRESS,
            ):
                raise AppointmentNotReadyError(
                    "La cita no está lista: el paciente debe haber registrado su llegada"
                )
            existing = await self._encounters.get_by_appointment(appointment.id)
            if existing is not None:
                raise EncounterExistsError(
                    "Esta cita ya tiene un encuentro", details={"encounter_id": str(existing.id)}
                )

        encounter = await self._encounters.add(
            patient_id=patient.id,
            appointment_id=appointment.id if appointment else None,
            doctor_user_id=actor.id,
            specialty=specialty.value,
            status=EncounterStatus.DRAFT.value,
            occurred_at=utcnow(),
        )
        if appointment is not None and appointment.status == AppointmentStatus.CHECKED_IN.value:
            appointment.status = AppointmentStatus.IN_PROGRESS.value  # inicia la atención
        await self._access.record(
            AuditAction.CREATE, actor, patient.id, RESOURCE_ENCOUNTER, encounter.id, context
        )
        await self._uow.commit()
        return encounter

    # ------------------------------------------------------------------- leer
    async def get(self, actor: User, encounter_id: uuid.UUID, context: RequestContext) -> Encounter:
        encounter = await self._visible(actor, encounter_id, context)
        await self._access.record(
            AuditAction.READ, actor, encounter.patient_id, RESOURCE_ENCOUNTER, encounter.id, context
        )
        await self._uow.commit()
        return encounter

    async def list_for_patient(
        self,
        actor: User,
        patient_id: uuid.UUID,
        context: RequestContext,
        *,
        limit: int,
        offset: int,
    ) -> list[Encounter]:
        patient = await self._access.patient_for_read(actor, patient_id, context)
        await self._access.record(
            AuditAction.READ, actor, patient.id, "encounter_list", None, context
        )
        await self._uow.commit()
        return await self._encounters.list_for_patient(
            patient.id, viewer_id=actor.id, limit=limit, offset=offset
        )

    async def _visible(
        self, actor: User, encounter_id: uuid.UUID, context: RequestContext
    ) -> Encounter:
        encounter = await self._require(encounter_id)
        await self._access.patient_for_read(actor, encounter.patient_id, context)
        if encounter.status == EncounterStatus.DRAFT.value and encounter.doctor_user_id != actor.id:
            await self._access.deny(actor, encounter.patient_id, "borrador de otro doctor", context)
        return encounter

    # ----------------------------------------------------------------- editar
    async def update_draft(
        self,
        actor: User,
        encounter_id: uuid.UUID,
        data: EncounterUpdate,
        context: RequestContext,
    ) -> Encounter:
        encounter = await self._editable(actor, encounter_id, context)
        changes = data.model_dump(exclude_unset=True)

        for field in (
            "subjective",
            "objective_notes",
            "assessment_notes",
            "plan",
            "followup_at",
            "vitals_not_applicable_reason",
        ):
            if field in changes:
                setattr(encounter, field, changes[field])
        if "history_reviewed" in changes and changes["history_reviewed"] is not None:
            encounter.history_reviewed_at = utcnow() if changes["history_reviewed"] else None
        if data.vitals is not None:
            await self._encounters.replace_vitals(encounter.id, self._vital_rows(data.vitals))
        if data.diagnoses is not None:
            await self._encounters.replace_diagnoses(
                encounter.id, await self._diagnosis_rows(data.diagnoses)
            )

        await self._encounters.reload(encounter)
        await self._access.record(
            AuditAction.UPDATE,
            actor,
            encounter.patient_id,
            RESOURCE_ENCOUNTER,
            encounter.id,
            context,
            reason="campos=" + ",".join(sorted(changes)),
        )
        await self._uow.commit()
        return encounter

    async def put_payload(
        self,
        actor: User,
        encounter_id: uuid.UUID,
        data: PayloadWrite,
        context: RequestContext,
    ) -> Encounter:
        encounter = await self._editable(actor, encounter_id, context)
        module = registry.get_module(Specialty(encounter.specialty))
        if module is None:
            raise SpecialtyModuleUnavailableError(
                "Esta especialidad aún no tiene su módulo clínico configurado"
            )
        try:
            validated = module.payload_model.model_validate(data.data)
        except ValidationError as exc:
            await self._uow.rollback()
            raise InvalidPayloadError(
                "Los datos de la especialidad no son válidos",
                details={"errors": [e["loc"] for e in exc.errors()]},
            ) from exc
        await self._encounters.set_payload(
            encounter.id,
            specialty=encounter.specialty,
            schema_version=module.schema_version,
            data=validated.model_dump(mode="json"),
        )
        await self._encounters.reload(encounter)
        await self._access.record(
            AuditAction.UPDATE,
            actor,
            encounter.patient_id,
            RESOURCE_ENCOUNTER,
            encounter.id,
            context,
            reason="campos=specialty_payload",
        )
        await self._uow.commit()
        return encounter

    async def _editable(
        self, actor: User, encounter_id: uuid.UUID, context: RequestContext
    ) -> Encounter:
        encounter = await self._require(encounter_id)
        await self._author_only(actor, encounter, context)
        if not can_edit(EncounterStatus(encounter.status)):
            raise EncounterNotEditableError(
                "El encuentro ya está firmado y no se puede editar: registre una adenda"
            )
        return encounter

    async def _author_only(
        self, actor: User, encounter: Encounter, context: RequestContext
    ) -> None:
        if encounter.doctor_user_id != actor.id:
            await self._access.deny(
                actor, encounter.patient_id, "encuentro de otro doctor", context
            )
        await self._access.patient_for_write(
            actor, encounter.patient_id, Specialty(encounter.specialty), context
        )

    # ----------------------------------------------- validación de hijos (borrador)
    @staticmethod
    def _vital_rows(inputs: list[VitalSignsIn]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for item in inputs:
            values: dict[str, Any] = {name: getattr(item, name) for name in _VITAL_FIELDS}
            try:
                validate_vitals(values)
            except ClinicalRuleError as exc:
                raise InvalidVitalsError(str(exc)) from exc
            for name in _ONE_DECIMAL:
                if values[name] is not None:
                    values[name] = Decimal(str(round(values[name], 1)))
            bmi = calculate_bmi(
                float(values["weight_kg"]) if values["weight_kg"] is not None else None,
                float(values["height_cm"]) if values["height_cm"] is not None else None,
            )
            if not has_any_vital(values):
                raise InvalidVitalsError("Una medición debe incluir al menos un valor")
            rows.append(
                {
                    "context": item.context.value,
                    "measured_at": item.measured_at or utcnow(),
                    "bmi": Decimal(str(bmi)) if bmi is not None else None,
                    **values,
                }
            )
        return rows

    async def _diagnosis_rows(self, inputs: list[DiagnosisIn]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in inputs:
            try:
                code = normalize_icd10(item.icd10_code)
            except ClinicalRuleError as exc:
                raise InvalidDiagnosisError(str(exc)) from exc
            if code in seen:
                raise InvalidDiagnosisError(f"El diagnóstico {code} está repetido")
            seen.add(code)
            catalog = await self._records.get_icd10(code)
            description = catalog.description if catalog else (item.description or "").strip()
            if not description:
                raise InvalidDiagnosisError(
                    f"{code} no está en el catálogo cargado: indique su descripción"
                )
            rows.append(
                {
                    "icd10_code": code,
                    "description": description,
                    "type": item.type.value,
                    "is_primary": item.is_primary,
                }
            )
        primaries = [r for r in rows if r["is_primary"]]
        if len(primaries) > 1:
            raise InvalidDiagnosisError("Solo puede haber un diagnóstico principal")
        if rows and not primaries:
            rows[0]["is_primary"] = True  # sin indicar, el primero es el principal
        return rows

    # -------------------------------------------------------- checklist y firma
    async def checklist(
        self, actor: User, encounter_id: uuid.UUID, context: RequestContext
    ) -> SigningChecklist:
        encounter = await self._visible(actor, encounter_id, context)
        missing = await self._missing(encounter)
        return SigningChecklist(
            can_sign=not missing,
            missing=[MissingItemRead(code=m.code, message=m.message) for m in missing],
        )

    async def _missing(self, encounter: Encounter) -> list[MissingItem]:
        valid_consents = await self._consents.valid_types(encounter.patient_id)
        reviewed = encounter.history_reviewed_at
        base = signing_checklist(
            SigningInput(
                subjective=encounter.subjective,
                plan=encounter.plan,
                diagnosis_count=len(encounter.diagnoses),
                has_vitals=any(
                    has_any_vital({n: getattr(v, n) for n in _VITAL_FIELDS})
                    for v in encounter.vitals
                ),
                vitals_not_applicable_reason=encounter.vitals_not_applicable_reason,
                history_reviewed_today=reviewed is not None
                and clinic_date(reviewed) == lima_today(),
                has_general_consent=ConsentType.GENERAL_CARE.value in valid_consents,
            )
        )
        module = registry.get_module(Specialty(encounter.specialty))
        if module is None:
            return base
        payload = None
        if encounter.payload is not None:
            payload = module.payload_model.model_validate(encounter.payload.data)
        extra = list(module.missing_for_signing(payload))
        for kind in required_consents_missing(
            (c.value for c in module.consents_required(payload)), valid_consents
        ):
            extra.append(MissingItem(f"consent_{kind.lower()}", f"Falta el consentimiento {kind}"))
        return [*base, *extra]

    async def sign(
        self, actor: User, encounter_id: uuid.UUID, context: RequestContext
    ) -> Encounter:
        encounter = await self._editable(actor, encounter_id, context)
        await self._encounters.reload(encounter)  # contenido tal como está en la BD
        missing = await self._missing(encounter)
        if missing:
            raise SigningBlockedError(
                "Faltan requisitos para firmar",
                details={"missing": [{"code": m.code, "message": m.message} for m in missing]},
            )

        profile = actor.doctor_profile
        encounter.signed_at = utcnow()
        encounter.signed_by = actor.id
        encounter.signer_name = actor.full_name
        encounter.signer_license = (
            f"{profile.professional_body} {profile.license_number}" if profile else None
        )
        encounter.content_hash = compute_content_hash(encounter_content(encounter))
        encounter.status = EncounterStatus.SIGNED.value
        await self._complete_appointment(actor, encounter, context)
        await self._access.record(
            AuditAction.SIGN, actor, encounter.patient_id, RESOURCE_ENCOUNTER, encounter.id, context
        )
        await self._uow.commit()
        return encounter

    async def _complete_appointment(
        self, actor: User, encounter: Encounter, context: RequestContext
    ) -> None:
        """Firmar cierra la atención: la cita vinculada pasa de 'en atención' a 'completada'."""
        if encounter.appointment_id is None:
            return
        appointment = await self._appointments.get(encounter.appointment_id)
        if appointment is None or appointment.status != AppointmentStatus.IN_PROGRESS.value:
            return
        try:
            validate_transition(AppointmentStatus.IN_PROGRESS, AppointmentStatus.COMPLETED)
        except AgendaRuleError:  # no debería ocurrir; se deja la cita como está
            return
        appointment.status = AppointmentStatus.COMPLETED.value
        await self._access.record(
            AuditAction.UPDATE,
            actor,
            encounter.patient_id,
            "appointment",
            appointment.id,
            context,
            reason="estado=COMPLETED",
        )

    # ------------------------------------------------------------ adendas e integridad
    async def add_addendum(
        self,
        actor: User,
        encounter_id: uuid.UUID,
        data: AddendumCreate,
        context: RequestContext,
    ) -> Encounter:
        encounter = await self._require(encounter_id)
        await self._author_only(actor, encounter, context)
        if not can_add_addendum(EncounterStatus(encounter.status)):
            raise NotSignedError("Las adendas solo se agregan a encuentros firmados")
        profile = actor.doctor_profile
        await self._encounters.add_addendum(
            encounter_id=encounter.id,
            reason=data.reason.strip(),
            text=data.text.strip(),
            created_by=actor.id,
            author_name=actor.full_name,
            author_license=(
                f"{profile.professional_body} {profile.license_number}" if profile else None
            ),
            created_at=utcnow(),
        )
        # El contenido firmado NO cambia (el trigger lo exige); solo el estado visible.
        encounter.status = EncounterStatus.AMENDED.value
        await self._encounters.reload(encounter)
        await self._access.record(
            AuditAction.AMEND,
            actor,
            encounter.patient_id,
            RESOURCE_ENCOUNTER,
            encounter.id,
            context,
        )
        await self._uow.commit()
        return encounter

    async def verify_integrity(
        self, actor: User, encounter_id: uuid.UUID, context: RequestContext
    ) -> IntegrityResult:
        encounter = await self._visible(actor, encounter_id, context)
        if encounter.content_hash is None:
            raise NotSignedError("El encuentro aún no está firmado")
        valid = verify_content_hash(encounter_content(encounter), encounter.content_hash)
        await self._access.record(
            AuditAction.READ,
            actor,
            encounter.patient_id,
            RESOURCE_ENCOUNTER,
            encounter.id,
            context,
            reason="integridad",
        )
        await self._uow.commit()
        return IntegrityResult(valid=valid, signed_at=encounter.signed_at)

    async def _require(self, encounter_id: uuid.UUID) -> Encounter:
        encounter = await self._encounters.get(encounter_id)
        if encounter is None:
            raise NotFoundError("Encuentro no encontrado")
        return encounter


# ---------------------------------------------------------------- hash canónico
def _ts(value: datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat(timespec="microseconds") if value else None


def _num(value: Decimal | int | float | None) -> str | None:
    return None if value is None else str(value)


def encounter_content(encounter: Encounter) -> dict[str, Any]:
    """Contenido canónico que se firma. Usa SOLO valores persistidos (reproducible al verificar)."""
    return {
        "encounter_id": str(encounter.id),
        "patient_id": str(encounter.patient_id),
        "appointment_id": str(encounter.appointment_id) if encounter.appointment_id else None,
        "doctor_user_id": str(encounter.doctor_user_id),
        "specialty": encounter.specialty,
        "occurred_at": _ts(encounter.occurred_at),
        "subjective": encounter.subjective,
        "objective_notes": encounter.objective_notes,
        "assessment_notes": encounter.assessment_notes,
        "plan": encounter.plan,
        "followup_at": encounter.followup_at.isoformat() if encounter.followup_at else None,
        "history_reviewed_at": _ts(encounter.history_reviewed_at),
        "vitals_not_applicable_reason": encounter.vitals_not_applicable_reason,
        "vitals": [
            {
                "context": v.context,
                "measured_at": _ts(v.measured_at),
                **{name: _num(getattr(v, name)) for name in (*_VITAL_FIELDS, "bmi")},
            }
            for v in sorted(encounter.vitals, key=lambda x: (x.measured_at, x.context))
        ],
        "diagnoses": [
            {
                "code": d.icd10_code,
                "description": d.description,
                "type": d.type,
                "is_primary": d.is_primary,
            }
            for d in sorted(encounter.diagnoses, key=lambda x: x.icd10_code)
        ],
        "payload": (
            {"schema_version": encounter.payload.schema_version, "data": encounter.payload.data}
            if encounter.payload
            else None
        ),
        "signer_name": encounter.signer_name,
        "signer_license": encounter.signer_license,
        "signed_at": _ts(encounter.signed_at),
    }
