"""Tipos anotados reutilizables: validan y normalizan en el borde de la API."""

from typing import Annotated

from pydantic import AfterValidator, StringConstraints

from app.domain.patient_rules import normalize_phone

# Nombres: sin espacios sobrantes; el límite evita abusos de almacenamiento.
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]

# Teléfono normalizado a un formato único (+51...) para poder detectar duplicados.
NormalizedPhone = Annotated[str, AfterValidator(normalize_phone)]
