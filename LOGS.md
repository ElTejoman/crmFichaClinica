# LOGS.md — Bitácora de avance y trazabilidad

> Formato: más reciente arriba. Cada entrada: fecha · fase · qué se hizo · decisiones · pendientes · verificación.
> Estados de fase: ⬜ pendiente · 🟨 en curso · ✅ completada

## Tablero de fases
| Fase | Estado |
|---|---|
| Planificación e investigación | ✅ (pendiente de aprobación del usuario) |
| 0 · Cimientos | ✅ |
| 1 · Identidad y seguridad | ⬜ |
| 2 · Pacientes + CRM | ⬜ |
| 3 · Agenda | ⬜ |
| 4 · Núcleo clínico | ⬜ |
| 5a Nutrición · 5b Acupuntura · 5c Quiropraxia · 5d Sueroterapia · 5e Odontología | ⬜ |
| 6 · Tablero dueño + portal paciente | ⬜ |
| 7 · Hardening y entrega | ⬜ |

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
