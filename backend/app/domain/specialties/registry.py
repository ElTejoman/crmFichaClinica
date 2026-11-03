"""Registro de módulos de especialidad. Vacío hasta la Fase 5 (los tests registran falsos)."""

from app.domain.enums import Specialty
from app.domain.specialties.base import SpecialtyModule

_MODULES: dict[Specialty, SpecialtyModule] = {}


def register(module: SpecialtyModule) -> None:
    _MODULES[module.specialty] = module


def get_module(specialty: Specialty) -> SpecialtyModule | None:
    return _MODULES.get(specialty)


def unregister(specialty: Specialty) -> None:
    """Solo para tests: deja el registro como estaba."""
    _MODULES.pop(specialty, None)
