# 02 · Arquitectura

## 1. Stack y justificación

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | **React 19 + Vite + TypeScript (strict)** | Ecosistema maduro, tipado fuerte, build rápido. |
| Estado servidor | **TanStack Query** | Caché, reintentos e invalidación; evita Redux innecesario. |
| Rutas | **React Router** | Rutas protegidas por rol. |
| Formularios | **React Hook Form + Zod** | Validación tipada; fichas largas sin re-renders costosos. |
| UI | **Tailwind CSS + Radix UI (primitivas accesibles)** | Diseño consistente propio, accesibilidad (teclado/ARIA). |
| Gráficos | **Recharts** | Tendencias (peso, EVA, vitales). |
| SVG propios | Odontograma, mapa de puntos de acupuntura, esquema vertebral | No hay librería adecuada para la simbología peruana. |
| Tipos API | **openapi-typescript** (generados desde OpenAPI de FastAPI) | Un solo contrato → cero desvíos front/back. |
| Backend | **FastAPI + Pydantic v2** | Validación declarativa, OpenAPI automática, async. |
| ORM | **SQLAlchemy 2.0 (async) + Alembic** | Migraciones versionadas, tipado moderno. |
| BD | **PostgreSQL 16** | JSONB (módulos de especialidad), integridad, extensiones (`pg_trgm` para búsqueda). |
| Auth | **JWT corto + refresh rotativo (cookie httpOnly) + Argon2id** | Equilibrio seguridad/UX; 2FA TOTP para roles clínicos. |
| Tests | pytest + httpx + Postgres real · Vitest + Testing Library · Playwright (e2e) | Pirámide de pruebas. |
| Calidad | ruff, mypy (strict), eslint, prettier, pre-commit | Clean code automatizado. |
| Infra | **Docker Compose** (db, api, web, [proxy en prod]) | Mismo entorno local/producción. |

## 2. Backend por capas (Clean Architecture pragmática)

```
HTTP ─► api (routers) ─► services (casos de uso) ─► repositories ─► models (SQLAlchemy) ─► PostgreSQL
              │                  │
              └──── schemas ◄────┴──── domain (enums, reglas puras, políticas, módulos de especialidad)
```

**Regla de dependencias** (solo hacia adentro, verificada por test de arquitectura):
- `api` conoce `services` y `schemas`; **nunca** `models` ni SQL.
- `services` orquestan reglas + repositorios; **no** conocen FastAPI/HTTP.
- `repositories` encapsulan SQLAlchemy; **no** contienen reglas de negocio.
- `domain` es Python puro (sin FastAPI ni SQLAlchemy): fácilmente testeable.
- `core` = configuración, seguridad, BD, logging; transversal.

```
backend/
├─ app/
│  ├─ main.py                  # fábrica de la app, middlewares, routers
│  ├─ core/                    # config.py, security.py, database.py, logging.py, errors.py
│  ├─ domain/
│  │  ├─ enums.py              # Role, Specialty, EncounterStatus, ...
│  │  ├─ policies/             # permisos RBAC + relación terapéutica
│  │  └─ specialties/          # un paquete por especialidad: schema Pydantic + validadores + reglas
│  │     ├─ base.py            # contrato SpecialtyModule
│  │     ├─ acupuncture.py  nutrition.py  chiropractic.py  iv_therapy.py  dentistry.py
│  ├─ models/                  # entidades SQLAlchemy
│  ├─ repositories/            # acceso a datos (1 por agregado)
│  ├─ services/                # casos de uso (auth, patients, leads, appointments, encounters, ...)
│  ├─ schemas/                 # DTOs Pydantic de entrada/salida
│  └─ api/
│     ├─ deps.py               # inyección: sesión, usuario actual, require_role, require_patient_access
│     └─ v1/                   # routers por recurso
├─ alembic/                    # migraciones
├─ tests/ (unit/, integration/, architecture/)
├─ scripts/seed.py             # datos de ejemplo
└─ pyproject.toml, Dockerfile
```

### Patrón de módulos de especialidad (clave del diseño híbrido)
```python
class SpecialtyModule(Protocol):
    specialty: Specialty
    schema_version: int
    payload_model: type[BaseModel]          # esquema Pydantic del bloque específico
    def missing_for_signing(self, payload: BaseModel | None) -> list[MissingItem]: ...
    def consents_required(self, payload: BaseModel | None) -> set[ConsentType]: ...
    # Fase 5 podría añadir red_flags(payload, patient) si la validación clínica lo exige.
```
*Implementado en la Fase 4* (`domain/specialties/base.py`); el registro está vacío hasta la Fase 5 y se probó con un módulo falso (validación del payload, requisitos de firma y consentimientos específicos).
- Un **registro** (`registry.py`) mapea `Specialty → SpecialtyModule`.
- Agregar una especialidad = 1 archivo en `domain/specialties` + 1 componente en el front. **Open/Closed.**

## 3. Frontend por funcionalidades (feature-sliced)

```
frontend/src/
├─ app/                 # providers, router, guards por rol, layout
├─ shared/              # ui/ (Button, Dialog…), lib/ (http client, fechas), hooks/, types/api.d.ts (generado)
├─ entities/            # patient, user, appointment (modelos + helpers de presentación)
├─ features/
│  ├─ auth/  patients/  leads/  agenda/  dashboard/
│  └─ clinical-record/
│     ├─ core/          # SOAP, vitales, alergias, diagnósticos, consentimientos, adjuntos, timeline
│     └─ specialties/   # acupuncture/ nutrition/ chiropractic/ iv-therapy/ dentistry/ (cada una autocontenida)
└─ pages/               # composición de pantallas por ruta
```
Reglas: una feature no importa de otra feature (solo de `shared`/`entities`); `pages` compone.

## 4. UX de la ficha (para el doctor)
- **Layout 3 zonas**: izquierda = línea de tiempo de visitas; centro = editor SOAP + módulo de especialidad en **pestañas/acordeones**; derecha = *resumen persistente* (alergias ⚠️, medicación, diagnósticos activos, última EVA/peso, banderas rojas).
- **Autoguardado** de borradores, indicador "guardado hace Xs".
- **Atajos de teclado**, plantillas de frases del doctor, copiar plan anterior (con aviso anti-clonado).
- **Checklist de completitud** antes de firmar; botones: *Guardar borrador* · *Firmar y cerrar*.
- Accesible (WCAG AA), responsivo (tablet en consultorio).

## 5. Flujos críticos
1. **Lead → Paciente**: lead cualificado → "Convertir" crea `Patient` (+HC) conservando origen y trazabilidad.
2. **Cita → Atención**: cita confirmada → *check-in* (recepción) → doctor abre `Encounter` (borrador) → completa → firma → cita "atendida".
3. **Corrección**: encuentro firmado → *adenda* (nuevo registro enlazado con motivo, autor, hora).
4. **Break-glass**: doctor sin relación con el paciente → motivo obligatorio → acceso 30 min → alerta al dueño.

## 6. Observabilidad y operación
- Logs JSON estructurados con `request_id`; **jamás** datos clínicos en logs.
- `/health` (liveness) y `/ready` (BD).
- Migraciones al arrancar el contenedor de `api` (solo en dev); en prod, paso explícito.
- Backups `pg_dump` programables (documentados en fase de hardening).

## 7. Decisiones registradas (ADR resumidos)
| ADR | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| 001 | Una HC por paciente, múltiples `Encounter` por especialidad | Una ficha aislada por especialidad | NTS 139 → HC única; alergias/medicación compartidas; visión integral. |
| 002 | Datos de especialidad en **JSONB validado por Pydantic con `schema_version`** | EAV; tabla por especialidad | EAV es inmanejable; tablas rígidas frenan cambios; JSONB + validación da flexibilidad con tipado. Datos consultables transversales (vitales, dx, alergias) van en **tablas relacionales**. |
| 003 | Notas firmadas **inmutables** + adendas | Edición libre con log | Integridad médico-legal (ALCOA+). |
| 004 | Auditoría **append-only con hash encadenado** | Log de texto | Detectar manipulación. |
| 005 | Usuario con **múltiples roles** (dueño = OWNER + DOCTOR) | Un rol por usuario | Requisito: dueño también es doctor. |
| 006 | Monolito modular, no microservicios | Microservicios | Equipo pequeño, un despliegue, límites claros por módulos. |
| 007 | Tipos del front generados de OpenAPI | Tipos escritos a mano | Evita desincronización. |
| 008 | Zona horaria: UTC en BD, `America/Lima` en presentación | Guardar hora local | Evita errores por DST/servidores. |
