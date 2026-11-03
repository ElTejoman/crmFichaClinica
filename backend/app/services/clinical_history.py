"""Resumen clínico y antecedentes longitudinales: alergias, medicación, condiciones.

Se comparten entre especialidades (ADR-001). Nada se borra: se inactiva (estado).
"""

import uuid

from app.core.clock import utcnow
from app.core.errors import BusinessRuleError, NotFoundError
from app.domain.clinical_rules import ClinicalRuleError, normalize_icd10
from app.domain.enums import AuditAction, ConsentType
from app.models.clinical import Allergy, Condition, Icd10Code, Medication
from app.models.user import User
from app.repositories.clinical_records import ClinicalRecordRepository
from app.repositories.consents import ConsentRepository
from app.repositories.encounters import EncounterRepository
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.clinical import (
    AllergyCreate,
    AllergyUpdate,
    ClinicalSummary,
    ConditionCreate,
    ConditionUpdate,
    ConsentStatus,
    MedicationCreate,
    MedicationUpdate,
)
from app.services.audit import RequestContext
from app.services.clinical_access import ClinicalAccess


class InvalidIcd10Error(BusinessRuleError):
    code = "invalid_icd10"


class ClinicalHistoryService:
    def __init__(
        self,
        *,
        records: ClinicalRecordRepository,
        encounters: EncounterRepository,
        consents: ConsentRepository,
        access: ClinicalAccess,
        uow: UnitOfWork,
    ) -> None:
        self._records = records
        self._encounters = encounters
        self._consents = consents
        self._access = access
        self._uow = uow

    # ------------------------------------------------------------------ resumen
    async def summary(
        self, actor: User, patient_id: uuid.UUID, context: RequestContext
    ) -> ClinicalSummary:
        patient = await self._access.patient_for_read(actor, patient_id, context)
        latest = await self._encounters.latest_signed(patient.id)
        valid = await self._consents.valid_types(patient.id)
        last_vitals = None
        if latest is not None and latest.vitals:
            last_vitals = max(latest.vitals, key=lambda v: v.measured_at)
        await self._access.record(
            AuditAction.READ, actor, patient.id, "clinical_summary", None, context
        )
        await self._uow.commit()
        return ClinicalSummary.model_validate(
            {
                "allergies": await self._records.list_allergies(patient.id, only_active=True),
                "medications": await self._records.list_medications(patient.id, only_active=True),
                "conditions": await self._records.list_conditions(patient.id, only_active=True),
                "last_vitals": last_vitals,
                "last_encounter_at": latest.occurred_at if latest else None,
                "signed_encounters": await self._encounters.count_signed(patient.id),
                "consents": ConsentStatus(
                    general_care=ConsentType.GENERAL_CARE.value in valid,
                    data_processing=ConsentType.DATA_PROCESSING.value in valid,
                ),
            },
            from_attributes=True,
        )

    # ----------------------------------------------------------------- alergias
    async def list_allergies(
        self, actor: User, patient_id: uuid.UUID, context: RequestContext, *, include_inactive: bool
    ) -> list[Allergy]:
        patient = await self._access.patient_for_read(actor, patient_id, context)
        await self._access.record(AuditAction.READ, actor, patient.id, "allergy", None, context)
        await self._uow.commit()
        return await self._records.list_allergies(patient.id, only_active=not include_inactive)

    async def add_allergy(
        self, actor: User, patient_id: uuid.UUID, data: AllergyCreate, context: RequestContext
    ) -> Allergy:
        patient = await self._access.patient_for_write(actor, patient_id, None, context)
        allergy = await self._records.add_allergy(
            patient_id=patient.id,
            substance=data.substance,
            reaction=data.reaction,
            severity=data.severity.value,
            status="ACTIVE",
            verified_at=utcnow() if data.verified else None,
            created_by=actor.id,
        )
        await self._access.record(
            AuditAction.CREATE, actor, patient.id, "allergy", allergy.id, context
        )
        await self._uow.commit()
        return allergy

    async def update_allergy(
        self, actor: User, allergy_id: uuid.UUID, data: AllergyUpdate, context: RequestContext
    ) -> Allergy:
        allergy = await self._records.get_allergy(allergy_id)
        if allergy is None:
            raise NotFoundError("Alergia no encontrada")
        await self._access.patient_for_write(actor, allergy.patient_id, None, context)
        changes = data.model_dump(exclude_unset=True)
        verified = changes.pop("verified", None)
        for key, value in changes.items():
            setattr(allergy, key, value.value if hasattr(value, "value") else value)
        if verified is not None:
            allergy.verified_at = utcnow() if verified else None
        await self._records.flush()
        await self._access.record(
            AuditAction.UPDATE,
            actor,
            allergy.patient_id,
            "allergy",
            allergy.id,
            context,
            reason="campos=" + ",".join(sorted(data.model_dump(exclude_unset=True))),
        )
        await self._uow.commit()
        return allergy

    # -------------------------------------------------------------- medicación
    async def list_medications(
        self, actor: User, patient_id: uuid.UUID, context: RequestContext, *, include_inactive: bool
    ) -> list[Medication]:
        patient = await self._access.patient_for_read(actor, patient_id, context)
        await self._access.record(AuditAction.READ, actor, patient.id, "medication", None, context)
        await self._uow.commit()
        return await self._records.list_medications(patient.id, only_active=not include_inactive)

    async def add_medication(
        self, actor: User, patient_id: uuid.UUID, data: MedicationCreate, context: RequestContext
    ) -> Medication:
        patient = await self._access.patient_for_write(actor, patient_id, None, context)
        medication = await self._records.add_medication(
            patient_id=patient.id, status="ACTIVE", created_by=actor.id, **data.model_dump()
        )
        await self._access.record(
            AuditAction.CREATE, actor, patient.id, "medication", medication.id, context
        )
        await self._uow.commit()
        return medication

    async def update_medication(
        self,
        actor: User,
        medication_id: uuid.UUID,
        data: MedicationUpdate,
        context: RequestContext,
    ) -> Medication:
        medication = await self._records.get_medication(medication_id)
        if medication is None:
            raise NotFoundError("Medicación no encontrada")
        await self._access.patient_for_write(actor, medication.patient_id, None, context)
        changes = data.model_dump(exclude_unset=True)
        for key, value in changes.items():
            setattr(medication, key, value.value if hasattr(value, "value") else value)
        await self._records.flush()
        await self._access.record(
            AuditAction.UPDATE,
            actor,
            medication.patient_id,
            "medication",
            medication.id,
            context,
            reason="campos=" + ",".join(sorted(changes)),
        )
        await self._uow.commit()
        return medication

    # -------------------------------------------------------------- antecedentes
    async def list_conditions(
        self, actor: User, patient_id: uuid.UUID, context: RequestContext, *, include_inactive: bool
    ) -> list[Condition]:
        patient = await self._access.patient_for_read(actor, patient_id, context)
        await self._access.record(AuditAction.READ, actor, patient.id, "condition", None, context)
        await self._uow.commit()
        return await self._records.list_conditions(patient.id, only_active=not include_inactive)

    async def add_condition(
        self, actor: User, patient_id: uuid.UUID, data: ConditionCreate, context: RequestContext
    ) -> Condition:
        patient = await self._access.patient_for_write(actor, patient_id, None, context)
        code: str | None = None
        if data.icd10_code:
            try:
                code = normalize_icd10(data.icd10_code)
            except ClinicalRuleError as exc:
                raise InvalidIcd10Error(str(exc)) from exc
        condition = await self._records.add_condition(
            patient_id=patient.id,
            kind=data.kind.value,
            icd10_code=code,
            description=data.description,
            active=True,
            created_by=actor.id,
        )
        await self._access.record(
            AuditAction.CREATE, actor, patient.id, "condition", condition.id, context
        )
        await self._uow.commit()
        return condition

    async def update_condition(
        self,
        actor: User,
        condition_id: uuid.UUID,
        data: ConditionUpdate,
        context: RequestContext,
    ) -> Condition:
        condition = await self._records.get_condition(condition_id)
        if condition is None:
            raise NotFoundError("Antecedente no encontrado")
        await self._access.patient_for_write(actor, condition.patient_id, None, context)
        changes = data.model_dump(exclude_unset=True)
        for key, value in changes.items():
            setattr(condition, key, value)
        await self._records.flush()
        await self._access.record(
            AuditAction.UPDATE,
            actor,
            condition.patient_id,
            "condition",
            condition.id,
            context,
            reason="campos=" + ",".join(sorted(changes)),
        )
        await self._uow.commit()
        return condition

    # ------------------------------------------------------------------- CIE-10
    async def search_icd10(self, query: str, *, limit: int) -> list[Icd10Code]:
        if not query.strip():
            return []
        return await self._records.search_icd10(query, limit=limit)
