# CRM + Ficha Clínica — Clínica multiespecialidad (Lima, Perú)

Aplicación web para gestionar pacientes, agenda, CRM de posibles clientes y **fichas clínicas** de: acupuntura, nutrición, quiropraxia, sueroterapia y odontología.

- **Frontend**: React + Vite + TypeScript (strict)
- **Backend**: FastAPI (Python) en capas · PostgreSQL 16
- **Despliegue**: Docker Compose

> **Estado**: fases 0–4 completas (identidad y seguridad, pacientes + CRM, agenda, núcleo clínico: historia, encuentros SOAP con firma, adendas, consentimientos y adjuntos). **Aún no existen los módulos por especialidad** (fase 5). Detalle y pendientes en `LOGS.md`.
> Convenciones y memoria del proyecto: `CLAUDE.md`. Plan: `docs/00-PLAN-MAESTRO.md`.

⚠️ Los aspectos normativos marcados **[VERIFICAR]** y los textos de consentimiento de ejemplo **no constituyen asesoría legal**. Los datos de demo son ficticios. No usar con datos reales de pacientes sin completar el checklist de `docs/06-SEGURIDAD-Y-CUMPLIMIENTO.md §7`.

## Requisitos
- **Con Docker**: Docker Desktop (Compose v2.24 o superior).
- **Sin Docker**: Python ≥ 3.12, Node 22, PostgreSQL 16 con una base `clinic` y un rol `clinic` (clave `clinic_dev`, con permiso para crear extensiones o superusuario: las migraciones activan `pg_trgm`, `btree_gist` (0001) y `unaccent` (0003)).

## Arranque rápido (Docker)
```bash
docker compose up --build        # web :5173 · api :8000/docs · db :5432
```
En otra terminal, carga los datos de demo (la primera vez):
```bash
docker compose exec api python scripts/seed.py
```
Abre http://localhost:5173 e ingresa con `dueno@clinica-demo.pe` / `Demo-Clinica-2026!`.

> El compose del repositorio solo se ha validado con `docker compose config` (sintaxis). Si algo falla al construir, revisa `LOGS.md` y avisa: nunca se ha levantado en un daemon real.

### Usuarios de demo (clave `Demo-Clinica-2026!`)
| Correo | Rol |
|---|---|
| `super@clinica-demo.pe` | Superusuario (administración técnica, sin acceso clínico) |
| `dueno@clinica-demo.pe` | Dueña + doctora de acupuntura |
| `nutricion@` · `quiropraxia@` · `sueros@` · `odontologia@clinica-demo.pe` | Doctores de cada especialidad |
| `recepcion@clinica-demo.pe` | Recepción (agenda y CRM, sin acceso clínico) |
| `paciente@clinica-demo.pe` | Paciente (el portal llega en la fase 6) |

## Desarrollo sin Docker
```bash
# Backend (terminal 1)
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head                                   # crea el esquema
python scripts/seed.py                                 # datos de demo (solo desarrollo)
uvicorn app.main:app --reload                          # http://localhost:8000/docs

# Frontend (terminal 2)
cd frontend
npm ci
npm run dev                                            # http://localhost:5173 (proxy /api → :8000)
```

## Pruebas y calidad
```bash
# Backend: necesita PostgreSQL y una base VACÍA `clinic_test` (con Docker: `docker compose up -d db`
# y luego `docker compose exec db createdb -U clinic clinic_test`).
cd backend && source .venv/bin/activate
pytest                                                 # ~3 min, 608 tests
ruff check . && ruff format --check . && mypy

# Frontend
cd frontend
npm run lint && npm run typecheck && npx prettier --check src && npm test && npm run build
```
⚠️ **Los tests ejecutan `DROP SCHEMA public CASCADE` en la base de `TEST_DATABASE_URL`** (por defecto `clinic_test`). No la apuntes nunca a una base con datos que quieras conservar.

Si cambias la API: `python backend/scripts/export_openapi.py frontend/openapi.json` y luego `npm run gen:api` en `frontend/`.

## Producción (sin validar)
```bash
cp .env.example .env     # define POSTGRES_PASSWORD y JWT_SECRET (openssl rand -hex 32)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Antes de usar datos reales faltan, entre otros: cifrado en reposo y antivirus para adjuntos, copias de seguridad, 2FA, límites de tasa y revisión legal (ver `docs/06` y `LOGS.md`).

## Mapa
`CLAUDE.md` (reglas y lecciones) · `LOGS.md` (avance) · `GRAPH.md` (estructura) · `AGENTS.md` · `docs/` (plan, investigación, arquitectura, modelo de datos, roles, fichas, seguridad, CRM/agenda).
