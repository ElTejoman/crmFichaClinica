"""Adjuntos clínicos (laboratorio, imágenes, fotos, informes, consentimientos escaneados).

Defensas (docs/06 §2): lista blanca de tipos, **verificación de los bytes reales** (un .exe
renombrado a .pdf se rechaza), límite de tamaño, nombre aleatorio en disco, SHA-256 y descarga
siempre como adjunto con `nosniff`. Las fotos exigen el consentimiento del paciente.
"""

import hashlib
import logging
import re
import uuid

from app.core.errors import BusinessRuleError, NotFoundError
from app.domain.clinical_rules import ALLOWED_MIME_TYPES, MAX_ATTACHMENT_BYTES, sniff_matches
from app.domain.enums import AttachmentKind, AuditAction
from app.models.clinical import Attachment
from app.models.user import User
from app.repositories.attachments import AttachmentRepository
from app.repositories.encounters import EncounterRepository
from app.repositories.file_storage import LocalFileStorage, StoredFileNotFoundError
from app.repositories.unit_of_work import UnitOfWork
from app.services.audit import RequestContext
from app.services.clinical_access import ClinicalAccess

_UNSAFE_NAME_CHARS = re.compile(r"[^\w.\- ()áéíóúñÁÉÍÓÚÑ]")
logger = logging.getLogger(__name__)


class AttachmentRejectedError(BusinessRuleError):
    code = "attachment_rejected"


class AttachmentFileMissingError(NotFoundError):
    code = "attachment_file_missing"


class AttachmentService:
    def __init__(
        self,
        *,
        attachments: AttachmentRepository,
        encounters: EncounterRepository,
        storage: LocalFileStorage,
        access: ClinicalAccess,
        uow: UnitOfWork,
    ) -> None:
        self._attachments = attachments
        self._encounters = encounters
        self._storage = storage
        self._access = access
        self._uow = uow

    async def upload(
        self,
        actor: User,
        patient_id: uuid.UUID,
        *,
        data: bytes,
        filename: str,
        mime: str,
        kind: AttachmentKind,
        encounter_id: uuid.UUID | None,
        has_patient_consent: bool,
        context: RequestContext,
    ) -> Attachment:
        patient = await self._access.patient_for_write(actor, patient_id, None, context)
        self._validate(data, mime, kind, has_patient_consent)
        if encounter_id is not None:
            encounter = await self._encounters.get(encounter_id)
            if encounter is None or encounter.patient_id != patient.id:
                raise AttachmentRejectedError("El encuentro indicado no pertenece a este paciente")

        key = LocalFileStorage.new_key()
        attachment = await self._attachments.add(
            patient_id=patient.id,
            encounter_id=encounter_id,
            kind=kind.value,
            original_name=_safe_name(filename),
            mime=mime,
            size_bytes=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
            storage_key=key,
            has_patient_consent=has_patient_consent,
            uploaded_by=actor.id,
        )
        await self._storage.save(key, data)
        try:
            await self._access.record(
                AuditAction.CREATE,
                actor,
                patient.id,
                "attachment",
                attachment.id,
                context,
                reason=f"tipo={kind.value}",
            )
            await self._uow.commit()
        except Exception:
            await self._storage.remove(key)  # no dejar un archivo huérfano si la BD falla
            raise
        return attachment

    @staticmethod
    def _validate(data: bytes, mime: str, kind: AttachmentKind, has_consent: bool) -> None:
        if not data:
            raise AttachmentRejectedError("El archivo está vacío")
        if len(data) > MAX_ATTACHMENT_BYTES:
            raise AttachmentRejectedError("El archivo supera el máximo de 10 MB")
        if mime not in ALLOWED_MIME_TYPES:
            raise AttachmentRejectedError("Tipo de archivo no permitido (PDF, PNG, JPEG o WEBP)")
        if not sniff_matches(mime, data[:16]):
            raise AttachmentRejectedError("El contenido del archivo no coincide con su tipo")
        if kind == AttachmentKind.PHOTO and not has_consent:
            raise AttachmentRejectedError("Las fotos requieren el consentimiento del paciente")

    async def list_for_patient(
        self, actor: User, patient_id: uuid.UUID, context: RequestContext
    ) -> list[Attachment]:
        patient = await self._access.patient_for_read(actor, patient_id, context)
        await self._access.record(AuditAction.READ, actor, patient.id, "attachment", None, context)
        await self._uow.commit()
        return await self._attachments.list_for_patient(patient.id)

    async def download(
        self, actor: User, attachment_id: uuid.UUID, context: RequestContext
    ) -> tuple[Attachment, bytes]:
        attachment = await self._attachments.get(attachment_id)
        if attachment is None:
            raise NotFoundError("Adjunto no encontrado")
        await self._access.patient_for_read(actor, attachment.patient_id, context)
        await self._access.record(
            AuditAction.READ,
            actor,
            attachment.patient_id,
            "attachment",
            attachment.id,
            context,
            reason="descarga",
        )
        await self._uow.commit()
        try:
            return attachment, await self._storage.read(attachment.storage_key)
        except StoredFileNotFoundError as exc:
            # Fila sin archivo = pérdida de datos clínicos: alerta para operaciones (solo el id
            # del adjunto, nunca nombre ni contenido) y un error controlado para el usuario.
            logger.error(
                "Adjunto sin archivo en disco", extra={"attachment_id": str(attachment.id)}
            )
            raise AttachmentFileMissingError(
                "El archivo no está disponible. Avise al administrador del sistema."
            ) from exc


def _safe_name(filename: str) -> str:
    """Nombre solo para mostrar: sin rutas ni caracteres de control (en disco es otro)."""
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    cleaned = _UNSAFE_NAME_CHARS.sub("_", base).strip(" .")
    return (cleaned or "archivo")[:200]
