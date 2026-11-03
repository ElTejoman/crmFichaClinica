"""Consentimientos informados: plantillas versionadas, captura, consulta y revocación.

- Se guarda la **versión exacta** del texto firmado.
- Menores: firma el apoderado (relación obligatoria).
- Procedimientos de riesgo (acupuntura invasiva, quiropraxia, sueroterapia, odontología) exigen
  consentimiento escrito/firmado; el verbal registrado solo vale para atención general y fotos
  (docs/01 §1, **[VERIFICAR]** con asesor legal).
- Se revocan, nunca se borran (y un trigger de BD lo refuerza).
- Los textos sembrados son EJEMPLOS no legales.
"""

import uuid

from app.core.clock import lima_today, utcnow
from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.domain.enums import AuditAction, ConsentMethod, ConsentType
from app.domain.patient_rules import requires_guardian
from app.models.clinical import Consent, ConsentTemplate
from app.models.user import User
from app.repositories.consents import ConsentRepository
from app.repositories.patients import PatientRepository
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.clinical import ConsentCreate
from app.services.audit import AuditService, RequestContext
from app.services.clinical_access import ClinicalAccess

# El consentimiento verbal solo es aceptable para estos tipos.
VERBAL_ALLOWED = frozenset({ConsentType.GENERAL_CARE, ConsentType.PHOTO_USE})
RESOURCE_CONSENT = "consent"


class NoConsentTemplateError(BusinessRuleError):
    code = "no_consent_template"


class ConsentRuleError(BusinessRuleError):
    code = "consent_rule_violation"


class AlreadyRevokedError(ConflictError):
    code = "consent_already_revoked"


class ConsentService:
    def __init__(
        self,
        *,
        consents: ConsentRepository,
        patients: PatientRepository,
        audit: AuditService,
        access: ClinicalAccess,
        uow: UnitOfWork,
    ) -> None:
        self._consents = consents
        self._access = access
        self._patients = patients
        self._audit = audit
        self._uow = uow

    async def list_templates(self) -> list[ConsentTemplate]:
        return await self._consents.list_templates()

    async def capture(
        self, actor: User, patient_id: uuid.UUID, data: ConsentCreate, context: RequestContext
    ) -> Consent:
        patient = await self._patients.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente no encontrado")
        template = await self._consents.latest_template(data.type.value)
        if template is None:
            raise NoConsentTemplateError("No hay un texto de consentimiento vigente para ese tipo")

        if data.method == ConsentMethod.VERBAL_RECORDED and data.type not in VERBAL_ALLOWED:
            raise ConsentRuleError(
                "Este procedimiento exige consentimiento escrito (firma en pantalla o documento)"
            )
        if data.method == ConsentMethod.ON_SCREEN and not data.signature_image:
            raise ConsentRuleError("Falta la firma en pantalla")
        if requires_guardian(patient.birth_date, lima_today()) and not data.signer_relation:
            raise ConsentRuleError(
                "El paciente es menor de edad: firma su apoderado (indique la relación)"
            )

        consent = await self._consents.add(
            patient_id=patient.id,
            type=data.type.value,
            template_id=template.id,
            text_version=template.version,
            method=data.method.value,
            signed_by_name=data.signed_by_name,
            signer_relation=data.signer_relation,
            signature_image=data.signature_image,
            witness_name=data.witness_name,
            signed_at=utcnow(),
            captured_by=actor.id,
        )
        await self._record(AuditAction.CREATE, actor, consent, context, f"tipo={data.type.value}")
        await self._uow.commit()
        return consent

    async def list_for_patient(self, patient_id: uuid.UUID) -> list[Consent]:
        if await self._patients.get(patient_id) is None:
            raise NotFoundError("Paciente no encontrado")
        return await self._consents.list_for_patient(patient_id)

    async def revoke(
        self, actor: User, consent_id: uuid.UUID, reason: str, context: RequestContext
    ) -> Consent:
        consent = await self._require(consent_id)
        if consent.revoked_at is not None:
            raise AlreadyRevokedError("El consentimiento ya fue revocado")
        await self._consents.revoke(consent, at=utcnow(), reason=reason.strip(), by=actor.id)
        await self._record(AuditAction.UPDATE, actor, consent, context, "revocado")
        await self._uow.commit()
        return consent

    async def signature_image(
        self, actor: User, consent_id: uuid.UUID, context: RequestContext
    ) -> str:
        consent = await self._require(consent_id)
        # La firma es un dato biométrico-administrativo del paciente: exige relación terapéutica
        # (o ser OWNER), no basta tener el permiso clínico genérico.
        await self._access.patient_for_read(actor, consent.patient_id, context)
        if consent.signature_image is None:
            raise NotFoundError("Este consentimiento no tiene firma en pantalla")
        await self._record(AuditAction.READ, actor, consent, context, "firma")
        await self._uow.commit()
        return consent.signature_image

    async def _require(self, consent_id: uuid.UUID) -> Consent:
        consent = await self._consents.get(consent_id)
        if consent is None:
            raise NotFoundError("Consentimiento no encontrado")
        return consent

    async def _record(
        self,
        action: AuditAction,
        actor: User,
        consent: Consent,
        context: RequestContext,
        reason: str,
    ) -> None:
        await self._audit.record(
            action,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_CONSENT,
            resource_id=str(consent.id),
            patient_id=consent.patient_id,
            reason=reason,
            context=context,
        )
