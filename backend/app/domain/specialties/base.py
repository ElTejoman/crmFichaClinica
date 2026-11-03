"""Contrato de un módulo clínico de especialidad (patrón abierto/cerrado, ADR-002).

El núcleo clínico NO conoce las especialidades: consulta el registro. Agregar una
especialidad = un archivo que implemente este contrato + registrarlo (Fase 5).
"""

from typing import Protocol

from pydantic import BaseModel

from app.domain.clinical_rules import MissingItem
from app.domain.enums import ConsentType, Specialty


class SpecialtyModule(Protocol):
    specialty: Specialty
    schema_version: int
    payload_model: type[BaseModel]

    def missing_for_signing(self, payload: BaseModel | None) -> list[MissingItem]:
        """Qué falta del módulo para poder firmar (vacío = completo)."""
        ...

    def consents_required(self, payload: BaseModel | None) -> set[ConsentType]:
        """Consentimientos específicos exigidos por lo registrado (p. ej. moxa → invasivo)."""
        ...
