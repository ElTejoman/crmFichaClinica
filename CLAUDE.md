# CLAUDE.md — Memoria del proyecto

> Léelo SIEMPRE al empezar una sesión. Luego lee `LOGS.md` (dónde quedamos) y `GRAPH.md` (estructura).

## Qué es
CRM + ficha clínica para **una clínica en Lima, Perú** con 5 especialidades: **acupuntura, nutrición, quiropraxia, sueroterapia, odontología**. Idioma de UI: **español (Perú)**; código, commits y nombres técnicos: **inglés**; comentarios y docs: **español**.

## Decisiones ya tomadas (no re-discutir sin motivo)
- Ficha **híbrida**: núcleo común (SOAP, vitales, CIE-10, consentimientos, adjuntos, firma) + módulo por especialidad (JSONB validado con Pydantic, `schema_version`).
- **Una HC por paciente**, varios encuentros por especialidad.
- Roles: `SUPERUSER, OWNER, DOCTOR, RECEPTION, PATIENT`; usuario con **múltiples roles** (dueño = OWNER+DOCTOR). **Lead** = entidad CRM, no usuario.
- Una sola sede. Zona horaria `America/Lima`, BD en UTC.
- Stack: React+Vite+TS strict / FastAPI + SQLAlchemy 2 async + Alembic + PostgreSQL 16 / Docker Compose.
- Trabajo en la nube: **no hay daemon Docker**; se prueba con Postgres 16 nativo + uvicorn + vite. Dockerfiles/compose están validados solo con `docker compose config` (sintaxis); el usuario valida con `docker compose up --build`.
- TypeScript fijado a **5.9.x** (openapi-typescript 7 exige TS 5; TS 7 del scaffold rompía el árbol de dependencias). `strict` y `noUncheckedIndexedAccess` activos.
- `npm audit`: 3 avisos moderados solo en `openapi-typescript` (herramienta de desarrollo, no se despliega; 0 en producción). No forzar downgrade.
- Rama de desarrollo: `claude/intelligent-bardeen-6xu34r`. **No crear PR** salvo que lo pida.

## Reglas de código (clean code)
1. Capas backend: `api → services → repositories → models`, `domain` puro. **Prohibido**: `api` importando `models`/SQL; `domain` importando fastapi/sqlalchemy. Hay test de arquitectura.
2. Routers delgados (≤ ~15 líneas por endpoint). Reglas de negocio en `services`/`domain`.
3. Nunca devolver modelos ORM; siempre `schemas` de respuesta.
4. Tipado estricto: `mypy --strict`, TS `strict`. Sin `any` ni `# type: ignore` sin justificar.
5. Comentarios: explican **por qué** (norma, riesgo clínico, decisión), no repiten el qué. Docstrings en funciones públicas.
6. Funciones pequeñas, nombres descriptivos, sin números mágicos (constantes con nombre).
7. **Datos clínicos**: sin borrado físico; encuentros firmados inmutables (solo adenda); toda lectura/escritura clínica se audita; **nunca** PII ni contenido clínico en logs.
8. Autorización en servidor (RBAC + especialidad + relación terapéutica). El front solo oculta UI, no protege.
9. Cada feature: tests (unit + integración), docs si cambia el modelo, entrada en `LOGS.md`, actualizar `GRAPH.md` si cambia la estructura.
10. Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).

## Honestidad normativa
Lo marcado **[VERIFICAR]** en `docs/01-INVESTIGACION-FICHA-CLINICA.md` NO está confirmado (NTS 139, retención 20 años, firma digital, NTS odontograma, bandera roja de quiropraxia). No presentarlo como hecho. Los textos de consentimiento son **ejemplos no legales**.

## Comandos
```bash
# Local del usuario (Docker Desktop)
docker compose up --build            # web :5173 · api :8000/docs · db :5432

# Backend (en la nube se usa Postgres nativo: `pg_ctlcluster 16 main start`)
cd backend && source .venv/bin/activate
pytest                               # tests (necesita Postgres en localhost, BD `clinic_test`)
ruff check . && ruff format . && mypy
alembic upgrade head                 # migraciones
python scripts/export_openapi.py ../frontend/openapi.json   # contrato → front

# Frontend
cd frontend
npm run gen:api                      # tipos desde openapi.json
npm run lint && npm run typecheck && npm test && npm run build
```

## Mapa de documentos
| Archivo | Para qué |
|---|---|
| `docs/00-PLAN-MAESTRO.md` | Fases, criterios, riesgos |
| `docs/01-INVESTIGACION-FICHA-CLINICA.md` | Normativa, buenas prácticas, huecos y fuentes |
| `docs/02-ARQUITECTURA.md` | Capas, stack, ADRs |
| `docs/03-MODELO-DE-DATOS.md` | Tablas, ERD, payloads por especialidad |
| `docs/04-ROLES-Y-PERMISOS.md` | Matriz y reglas de autorización |
| `docs/05-FICHAS-POR-ESPECIALIDAD.md` | UX y reglas de firma por especialidad |
| `docs/06-SEGURIDAD-Y-CUMPLIMIENTO.md` | Ley 29733, controles, auditoría |
| `docs/07-CRM-Y-AGENDA.md` | Embudo, citas |
| `LOGS.md` | Bitácora de avance (append-only, más reciente arriba) |
| `GRAPH.md` | Estructura viva del proyecto y dependencias |
| `AGENTS.md` | Roles de subagentes y cuándo usarlos |
| `.claude/skills/*` | Skills del proyecto (procedimientos repetibles) |

## Protocolo de sesión
1. Leer CLAUDE.md → LOGS.md (última entrada) → GRAPH.md.
2. Trabajar en la fase actual (ver LOGS.md "Siguiente paso").
3. Al terminar un bloque: tests verdes → actualizar LOGS.md y GRAPH.md → commit → push.
