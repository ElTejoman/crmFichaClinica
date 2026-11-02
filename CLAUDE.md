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

## Lecciones de tests (no repetir)
- Los tests de integración deben fallar si se rompe el comportamiento: verificar con una **mutación** manual los controles críticos (seguridad, auditoría).
- httpx ignora cookies de dominios sin punto (`test`): enviar `Cookie` explícito, no depender del cookie-jar.
- SQLAlchemy async: toda relación que se serialice debe cargarse (`lazy="selectin"`) o inicializarse; nunca depender de carga perezosa.
- Un servicio que audita un fallo debe `commit` **antes** de lanzar el error.
- **Procesos**: nunca `pkill -f` ni `ps|grep|kill` (coinciden con el propio shell y lo matan; ya pasó 3 veces). Usar `bash scripts/dev/start-api.sh > /tmp/api.log 2>&1 & echo $! > /tmp/api.pid` (usa `exec`: el PID es el del servidor) y `kill $(cat /tmp/api.pid)`, o `python3 scripts/dev/stop-api.py`. Un `cd x && bash script &` guarda el PID del subshell, no del servidor (lo repetí en la Fase 2): poner `cd` en su PROPIA línea y luego `bash script & echo $!`.
- **Scripts de parcheo**: toda sustitución debe hacer `assert ancla in texto` ANTES de reemplazar. `ruff format` reescribe el código entre pasos y un `str.replace` sin assert falla en silencio (me costó 3 migraciones/archivos a medias).
- **Migraciones**: `alembic revision --autogenerate` NO crea secuencias, funciones ni extensiones: añadirlas a mano. Verificar siempre el ciclo `upgrade → alembic check → downgrade → upgrade → alembic check`. No editar una migración ya aplicada sin hacer downgrade antes.
- **Pydantic**: `model_copy(update=...)` NO valida ni convierte: pasar enums, no strings (si no, falla más adelante con un 500).
- **Hora en PostgreSQL**: `now()` es la hora de INICIO de la transacción; filas creadas juntas empatan. Si importa el orden, fijar `utcnow()` en Python.
- **SQLAlchemy 2.1 async**: `Select[Patient]` (no `Select[tuple[...]]`); arrays: `literal(x) == any_(col)`; columnas con `server_default`/`onupdate` necesitan `eager_defaults` (ya en `TimestampMixin`) o fallan al serializar.
- **Aislamiento de tests**: `TRUNCATE users … CASCADE` solo vacía tablas con FK hacia `users`. Toda tabla nueva SIN esa FK (p. ej. `rooms`, `appointment_types`) debe añadirse a la lista del fixture `engine` en `tests/conftest.py`, o sus filas se filtran entre tests (síntoma: 409 por nombre duplicado en la fixture).
- **Tests y hora real**: no depender de la hora a la que corre la suite. Para probar check-in (mismo día) o ausencia (hora pasada) usar `tests/agenda_helpers.insert_appointment` (inserta saltándose las reglas); las citas "normales" se agendan en un lunes futuro (`next_monday()`).
- **Velocidad de tests**: `tests/conftest.py` usa Argon2id de coste mínimo (la suite pasa de ~4 min a ~2,5). No tocar los parámetros de `core/security.py`.
- **`ruff --fix` borra imports "sin usar"** aunque aún no los hayas usado (me pasó con `Any`): añade el import junto con su primer uso.
- **Aserciones vacías**: nunca `assert (...) or True` ni `... and False`; un test que no puede fallar es peor que no tenerlo. Verificar los controles críticos con una mutación.
- **Búsqueda en español**: siempre sin tildes (`f_unaccent`) y tolerante a erratas (`<%` word_similarity); escapar `% _ \` del usuario en LIKE.

## Honestidad normativa
Lo marcado **[VERIFICAR]** en `docs/01-INVESTIGACION-FICHA-CLINICA.md` NO está confirmado (NTS 139, retención 20 años, firma digital, NTS odontograma, bandera roja de quiropraxia). No presentarlo como hecho. Los textos de consentimiento son **ejemplos no legales**.

## Comandos
```bash
# Local del usuario (Docker Desktop)
docker compose up --build            # web :5173 · api :8000/docs · db :5432

# Backend (en la nube se usa Postgres nativo; tras reiniciar el contenedor: `pg_ctlcluster 16 main start`)
cd backend && source .venv/bin/activate
pytest                               # tests (necesita Postgres en localhost, BD `clinic_test`)
ruff check . && ruff format . && mypy
alembic upgrade head                 # migraciones
python scripts/export_openapi.py ../frontend/openapi.json   # contrato → front
python scripts/seed.py               # 8 usuarios demo (clave Demo-Clinica-2026!) — solo dev

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
