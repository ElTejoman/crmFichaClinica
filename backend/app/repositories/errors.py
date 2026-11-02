"""Errores de persistencia independientes de SQLAlchemy.

Los servicios no importan SQLAlchemy (regla de capas): el repositorio traduce los errores
del motor a estas excepciones.
"""


class UniqueViolationError(Exception):
    """Se violó una restricción de unicidad (p. ej. documento de paciente duplicado)."""


class OverlapViolationError(Exception):
    """La BD rechazó una cita por solapamiento (restricción de exclusión).

    `resource` indica qué se pisó: `doctor`, `room` o `patient`.
    """

    def __init__(self, resource: str) -> None:
        super().__init__(f"solapamiento de {resource}")
        self.resource = resource
