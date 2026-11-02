"""Errores de persistencia independientes de SQLAlchemy.

Los servicios no importan SQLAlchemy (regla de capas): el repositorio traduce los errores
del motor a estas excepciones.
"""


class UniqueViolationError(Exception):
    """Se violó una restricción de unicidad (p. ej. documento de paciente duplicado)."""
