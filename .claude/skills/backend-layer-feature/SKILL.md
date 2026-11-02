---
name: backend-layer-feature
description: Implementar un recurso del backend FastAPI respetando las capas (model → repository → service → schema → router) con tests y auditoría. Usar al crear o ampliar cualquier endpoint de este proyecto.
---

# Procedimiento: nuevo recurso backend en capas

Antes: leer `CLAUDE.md` (reglas de código), `docs/03-MODELO-DE-DATOS.md`, `docs/04-ROLES-Y-PERMISOS.md`.

1. **Modelo** (`app/models/<x>.py`): SQLAlchemy 2.0 tipado (`Mapped[...]`), UUID PK, `created_at/updated_at`, `deleted_at` (borrado lógico). Migración Alembic (`alembic revision --autogenerate`, revisar a mano).
2. **Dominio** (`app/domain/`): enums y reglas puras. Si hay permisos nuevos, agregar a `policies/`.
3. **Repositorio** (`app/repositories/<x>.py`): solo consultas/persistencia; devuelve entidades, sin reglas.
4. **Schemas** (`app/schemas/<x>.py`): `Create`, `Update`, `Read` separados. `Read` nunca expone hashes/secretos. `model_config = ConfigDict(from_attributes=True)`.
5. **Servicio** (`app/services/<x>.py`): caso de uso; recibe repos por inyección; aplica reglas, valida autorización de objeto (IDOR), **registra auditoría** (`audit.record(...)`) en lecturas/escrituras clínicas.
6. **Router** (`app/api/v1/<x>.py`): delgado; `Depends(require_role(...))`; `response_model` explícito; códigos HTTP correctos.
7. **Tests**: unit del servicio/dominio + integración con Postgres (caso feliz, 401, 403 por cada rol, 404, validación 422, auditoría creada).
8. **Cierre**: `ruff check`, `mypy --strict`, `pytest` verdes → actualizar `GRAPH.md` y `LOGS.md`.

Prohibido: importar `models` en el router; lógica de negocio en el router; devolver ORM; loguear PII/contenido clínico.
