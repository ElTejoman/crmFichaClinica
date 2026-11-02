# LOGS.md — Bitácora de avance y trazabilidad

> Formato: más reciente arriba. Cada entrada: fecha · fase · qué se hizo · decisiones · pendientes · verificación.
> Estados de fase: ⬜ pendiente · 🟨 en curso · ✅ completada

## Tablero de fases
| Fase | Estado |
|---|---|
| Planificación e investigación | ✅ (pendiente de aprobación del usuario) |
| 0 · Cimientos | ✅ |
| 1 · Identidad y seguridad | ✅ |
| 2 · Pacientes + CRM | ✅ |
| 3 · Agenda | ⬜ |
| 4 · Núcleo clínico | ⬜ |
| 5a Nutrición · 5b Acupuntura · 5c Quiropraxia · 5d Sueroterapia · 5e Odontología | ⬜ |
| 6 · Tablero dueño + portal paciente | ⬜ |
| 7 · Hardening y entrega | ⬜ |

---

## 2026-11-02 · Fase 2 — Pacientes + CRM ✅
**Hecho (backend)** — detalle en `docs/03 §5`, `docs/04 §5`, `docs/06 §9`, `docs/07 §3-4`.
- Pacientes: documento peruano validado y único, historia clínica única automática con correlativo desde secuencia de BD (`HC-000001`), apoderado obligatorio en menores, consentimiento de datos obligatorio, archivado (sin borrado), normalización de teléfonos, auditoría de lectura/escritura con `patient_id` y **solo nombres de campos** (sin valores).
- Búsqueda sin tildes (`f_unaccent` + índice GIN trigram) y tolerante a erratas (`word_similarity`); duplicados probables (nombre aprox. + fecha de nacimiento, o teléfono) con documento enmascarado. **Medido: 5–27 ms con 20.000 pacientes, índice usado.**
- Relación terapéutica (`care_team`): un doctor solo ve sus pacientes; sin relación, 403 auditado.
- CRM: embudo con reglas en el dominio, actividades, próxima acción, seguimientos de hoy (hora de Lima), detección de duplicados lead/paciente, conversión atómica a paciente, estadísticas solo para OWNER, doctor ve solo leads asignados. El lead trae `assigned_to_name` y `lost_reason`.
- Migración `0003` (secuencia, función `f_unaccent`, índices) con ciclo upgrade/check/downgrade/upgrade verificado.
**Hecho (frontend, subagente `frontend-dev`, reverificado por el agente principal)**
- Pacientes: búsqueda con debounce, alta por secciones (apoderado aparece/obligatorio si es menor, aviso de duplicados, consentimiento), ficha, edición parcial, archivado y equipo tratante. CRM: tablero Kanban (arrastrar + "Mover a…" accesible por teclado), detalle, actividades, conversión con formulario pre-rellenado, Perdidos/Convertidos, seguimientos de hoy en inicio y estadísticas del dueño. Componentes nuevos: Dialog (foco atrapado), Tabs (WAI-ARIA), Textarea. Sin dependencias nuevas.

**Verificación (evidencia, ejecutada por el agente principal)**
- Backend: ruff ✅ · mypy --strict ✅ (80 archivos) · alembic check ✅ · **pytest 221 passed** (PostgreSQL 16 real).
- Mutaciones backend (6): filtro de cartera del doctor, chequeo de relación terapéutica, apoderado en menores, commit prematuro en conversión, PII en auditoría, búsqueda sin tildes → cada una hace fallar el test correspondiente. Se añadió un test de **fallo tardío** porque los de atomicidad existentes fallaban antes de cualquier commit y no detectaban un commit prematuro.
- Frontend: oxlint ✅ · tsc ✅ · prettier ✅ · **vitest 174 passed (37 archivos)** · build ✅. El subagente probó 8 mutaciones propias; yo probé 1 sobre lo añadido después.
- E2E en Chromium (subagente, 44/44): búsqueda sin tildes y con errata, alta de adulto y menor, duplicados, DNI repetido (409), Kanban (menú y arrastre), Perdido con motivo, reabrir, actividad con próxima acción visible como "Vencida", conversión a paciente, estadísticas solo dueño, doctor sin cartera → asignación → ve → finalización → deja de ver, tablet 820 px sin scroll horizontal.

**Bugs encontrados por las pruebas y corregidos**
- "Maria Gomez" no encontraba a "María Gómez" (faltaba búsqueda sin tildes) y "gomes" no encontraba "Gómez" (`similarity` vs `word_similarity`).
- Actividades creadas en la misma transacción tenían el mismo `created_at` (`now()` = inicio de transacción) → orden indefinido.
- Conversión con error 500: `model_copy(update=)` recibía un string en vez de enum (no valida).
- `assigned_to_name` provocó `MissingGreenlet` en lead recién creado/reasignado (relación no cargada) → se recarga el responsable.
- `api.d.ts` (generado) se reformateaba con Prettier y rompería el chequeo de CI → añadido a `.prettierignore`.
- Mi comando de pruebas mató mi propio shell / dejó un servidor huérfano **tres veces** (pkill y `cmd && script &`). Solución: `scripts/dev/start-api.sh` y `stop-api.py`; lección en CLAUDE.md.

**NO verificado**
- `docker compose` (sin daemon). Lectores de pantalla y contraste AA medido (solo revisión visual). Navegadores distintos de Chromium y arrastre táctil.
- Los campos nuevos `assigned_to_name`/`lost_reason` en el E2E de navegador (se añadieron después de la corrida del subagente; cubiertos por pytest y vitest). La BD de desarrollo no tiene leads asignados ni perdidos para verlos.
- **Push a GitHub bloqueado (403)**: 8 commits locales sin subir.

**Observaciones del subagente sobre el API (no resueltas)**
- Los 422 de FastAPI que no vienen de un validador propio llegan en inglés (p. ej. UUID inválido en la URL).
- `GET /leads?assigned_to=` no permite filtrar "sin asignar".
- `GET /patients/duplicates` exige PATIENTS_MANAGE (un doctor recibiría 403; es coherente pero hay que recordarlo).
- `lost_reason` es texto libre: las estadísticas por motivo solo agrupan bien si se usan motivos repetidos (la UI sugiere los frecuentes). Convendría un catálogo.
- `GET /leads/followups` no devuelve el *motivo* de la próxima acción, solo la hora.
- Quedan datos de prueba (DNI 9000xxxx…, teléfonos +5190000…) en la BD de desarrollo: no se pueden borrar por API.

**Datos y decisiones**
- Fase 2 adelantó `care_team` desde la Fase 3/4 (base de la autorización de doctores).
- En el frontend la edad/apoderado se calcula con la fecha de **Lima** (igual que el servidor) y la conversión solo se ofrece para leads abiertos (el servidor sí permitiría convertir uno perdido).

**Siguiente paso**: Fase 3 — Agenda (horarios, excepciones, salas, citas sin solapamiento con constraint de exclusión, check-in, series de sesiones, creación automática de relación terapéutica al agendar).

---

## 2026-11-02 · Fase 1 — Identidad y seguridad ✅
**Hecho (backend)** — ver `docs/06 §8` para el detalle de controles.
- Usuarios multi-rol + perfil profesional (colegiatura/especialidades); login Argon2id con bloqueo por fuerza bruta; JWT 15 min + refresh rotativo en cookie httpOnly con detección de reutilización; RBAC con auditoría de denegaciones; reglas anti-escalada (solo SUPERUSER toca OWNER/SUPERUSER); auditoría append-only (trigger) con hash encadenado y endpoint de verificación; migración `0002`; `seed.py` (8 usuarios demo).
- Invariante añadido tras revisión: no se puede asignar el rol DOCTOR a un usuario sin perfil profesional (`doctor_profile_required`).
**Hecho (frontend, delegado a subagente `frontend-dev` y reverificado por el agente principal)**
- Sesión en memoria con refresh silencioso y refresh único ante 401 simultáneos, cierre por inactividad (15 min), rutas protegidas por rol, layout responsive, login, gestión de usuarios, visor de auditoría con verificación de integridad. Dependencias nuevas: `react-hook-form`, `zod`, `@hookform/resolvers`.

**Verificación (evidencia, ejecutada por el agente principal)**
- Backend: ruff ✅ · mypy --strict ✅ (60 archivos) · **pytest 85 passed** (PostgreSQL 16 real, migraciones reales).
- Mutaciones: quitar revocación de familia / bloqueo de cuenta / chequeo de usuario activo → falla exactamente el test correspondiente (los tests no son vacuosos).
- Frontend: oxlint ✅ · tsc ✅ · vitest **49 passed** (10 archivos) · build ✅. Sin `any`; token no usa storage.
- E2E en Chromium (subagente): login/recarga con sesión persistente, alta y desactivación de usuario, 409 por correo duplicado, auditoría + "cadena íntegra", recepción sin acceso (403/404), logout, sin errores de consola de la app.

**Bugs encontrados por las pruebas y corregidos**
- Crear un usuario sin perfil de doctor devolvía 500 (`MissingGreenlet`: relación no cargada en SQLAlchemy async).
- Dos tests pasaban en falso (el cookie-jar de httpx ignora dominios sin punto): reescritos con cabecera `Cookie` explícita.
- El evento LOGOUT se guardaba sin roles del actor.

**NO verificado**
- Cierre real a los 15 min de inactividad en navegador (solo test unitario con temporizadores simulados).
- Cadena alterada (`valid=false`) mostrada en la UI; un 403 real del API en la UI (se vio el 403 del guard del front).
- Docker (sigue sin daemon en la nube). **Push bloqueado (403)**: 5 commits locales sin subir.

**Limitaciones conocidas / deuda**
- `PATCH /users/{id}` no permite vaciar el teléfono ni editar el perfil profesional (llegará con la gestión de doctores).
- El refresh silencioso sin cookie deja un 401 en la consola del navegador al abrir la app anónimo (inherente al diseño).
- `LOGIN_FAILED` guarda el id de la cuenta objetivo (intencional, útil para auditoría).
- La cadena de hash no detecta borrado de la cola (ver `docs/06 §3`).
- La BD de desarrollo contiene datos de las pruebas manuales (usuarios demo extra inactivos).

**Siguiente paso**: Fase 2 — Pacientes + CRM (pacientes con HC automática, detección de duplicados, apoderado en menores; leads con embudo y conversión).

---

## 2026-11-02 · Fase 0 — Cimientos ✅
**Hecho**
- Backend: FastAPI por capas (`core`, `api`, `services`, `repositories`, `schemas`, `domain`, `models`), `create_app()` con CORS, `X-Request-ID`, errores uniformes, logging JSON sin PII, config tipada que **rechaza secretos de desarrollo en producción**.
- `/health` (liveness) y `/ready` (BD; 503 si cae) implementados atravesando todas las capas como patrón de referencia.
- **Test de arquitectura** (AST) que falla si se rompe la regla de dependencias; verificado con una violación deliberada.
- Alembic async + migración `0001` (extensiones `pg_trgm`, `btree_gist` para búsqueda difusa y citas sin solapamiento). Aplicada sobre Postgres real.
- Frontend: React 19 + Vite + TS strict + Tailwind 4 + TanStack Query + Router; feature `system-status`; tipos **generados desde OpenAPI** (`openapi.json` → `api.d.ts`); proxy `/api`.
- Docker: Dockerfiles multi-stage (dev/prod), `docker-compose.yml` (db+api+web con healthchecks) y `docker-compose.prod.yml`, Nginx con cabeceras de seguridad.
- CI (GitHub Actions: lint, mypy, migraciones, pytest, contrato OpenAPI, tipos, build) y pre-commit.

**Verificación (evidencia)**
- Backend: `ruff` ✅ · `ruff format` ✅ · `mypy --strict` ✅ (30 archivos) · `pytest` **14 passed** (incluye `/ready` contra Postgres 16 real).
- Frontend: `oxlint` ✅ · `tsc` ✅ · `vitest` **3 passed** · `vite build` ✅.
- E2E manual: uvicorn + vite + Chromium headless → la página muestra "Sistema operativo", sin errores de consola; `curl :5173/api/ready` atraviesa el proxy.
- `docker compose config` válido para dev y prod.

**NO verificado**
- `docker compose up --build` y los Dockerfiles: no hay daemon Docker en la nube. Puede haber ajustes menores al primer arranque local.
- Push a GitHub sigue bloqueado (403, ver abajo).

**Decisiones**
- TypeScript 5.9 (no 7) por compatibilidad con openapi-typescript. `npm audit`: 3 avisos moderados solo en dev-tool, 0 en producción.
- `api/deps.py` es la única excepción documentada a la regla de capas (raíz de composición).
- Postgres nativo 16 para pruebas en la nube (usuario/BD `clinic`/`clinic_test`).

**Siguiente paso**: Fase 1 — usuarios, multi-rol, login/refresh (Argon2id + JWT), RBAC, auditoría con hash encadenado.

---

## 2026-11-02 · Planificación e investigación
**Hecho**
- Respuestas del usuario recibidas: ficha híbrida, Lima-Perú, una sede, matriz de roles aprobada, stack aprobado, sin identidad visual, con datos de ejemplo, trabajo en nube.
- Investigación web (normativa peruana, documentación por especialidad, seguridad/auditoría) → `docs/01-INVESTIGACION-FICHA-CLINICA.md`.
- Documentos de diseño `docs/00`–`07`, `CLAUDE.md`, `AGENTS.md`, `GRAPH.md`, `LOGS.md`, skills de proyecto en `.claude/skills/`.

**Limitaciones registradas**
- No se pudo leer el texto de la NTS 139 (dominios `cmp.org.pe`, `elperuano.pe` bloqueados). Todo lo dependiente → **[VERIFICAR]**.
- El catálogo de skills de claude.ai del usuario no tiene skills relevantes (búsqueda vacía) → se crearon skills propias del proyecto.
- Fuentes de quiropraxia (banderas rojas), nutrición y sueroterapia son secundarias; requieren validación clínica.

**Entorno verificado**: Python 3.13, Node 22, Docker CLI 29.x, pip y npm accesibles. Daemon Docker/PostgreSQL: por verificar en Fase 0.

**Bloqueo**: `git push` devolvió 403 (la app de GitHub de Claude no tiene acceso a `ElTejoman/crmFichaClinica`). El commit existe solo en el contenedor hasta que se corrija el acceso y se haga el push.

**Siguiente paso**: esperar aprobación del plan por el usuario → iniciar Fase 0.
