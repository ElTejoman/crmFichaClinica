# GRAPH.md — Estructura viva del proyecto

> Actualizar cuando cambie la estructura. Leyenda: ✅ existe · ⬜ planificado.

## 1. Árbol de carpetas (objetivo)
```
crmFichaClinica/
├─ CLAUDE.md ✅  LOGS.md ✅  AGENTS.md ✅  GRAPH.md ✅  README.md ✅
├─ docs/ ✅  (00 plan · 01 investigación · 02 arquitectura · 03 datos · 04 roles · 05 fichas · 06 seguridad · 07 crm/agenda)
├─ .claude/skills/ ✅  (backend-layer-feature · frontend-feature · clinical-specialty-module)
├─ docker-compose.yml ✅  docker-compose.prod.yml ✅  .env.example ✅  .gitignore ✅  .pre-commit-config.yaml ✅
├─ .github/workflows/ci.yml ✅
├─ backend/ ✅ (Fase 0: core, health, tests de arquitectura; resto ⬜)
│  ├─ app/{main.py, core/, domain/{policies/, specialties/}, models/, repositories/, services/, schemas/, api/{deps.py, v1/}}
│  ├─ alembic/  tests/{unit,integration,architecture}  scripts/{seed.py, verify_audit_chain.py}
│  └─ pyproject.toml ✅  Dockerfile ✅  alembic/versions/{0001 extensiones, 0002 identidad+auditoría} ✅
└─ frontend/ ✅ (Fase 0-1: shell, auth, users, audit, system-status; resto ⬜)
   ├─ src/{app/, shared/, entities/, features/{auth,patients,leads,agenda,dashboard,clinical-record/{core,specialties/*}}, pages/}
   └─ package.json  vite.config.ts  tsconfig.json  Dockerfile
```

## 2. Dependencias entre capas (backend)
```mermaid
flowchart LR
    API[api/v1 routers] --> SVC[services]
    API --> SCH[schemas]
    SVC --> REPO[repositories]
    SVC --> DOM[domain]
    SVC --> SCH
    REPO --> MOD[models]
    DOM -. sin dependencias externas .-> DOM
    CORE[core: config, security, db, logging] --> API
    CORE --> SVC
    CORE --> REPO
```
Prohibido: `api → models`, `domain → fastapi|sqlalchemy`, `repositories → services`.

## 3. Módulos funcionales y dependencias
```mermaid
flowchart TD
    AUTH[auth / users / roles] --> AUDIT[audit log]
    AUTH --> PAT[patients + clinical_history]
    LEAD[leads CRM] -->|convertir| PAT
    PAT --> AGENDA[agenda / appointments]
    AGENDA --> ENC[encounters SOAP]
    PAT --> ENC
    ENC --> CORE[núcleo clínico: vitales, dx, alergias, consentimientos, adjuntos]
    ENC --> SPEC{{specialty modules}}
    SPEC --> NUT[nutrición]
    SPEC --> ACU[acupuntura]
    SPEC --> QUI[quiropraxia]
    SPEC --> SUE[sueroterapia]
    SPEC --> ODO[odontología]
    ENC -->|todo acceso| AUDIT
    PAT --> PORTAL[portal paciente]
    AUDIT --> OWNERDASH[tablero dueño]
```

## 4. Flujo de datos de una atención
```mermaid
sequenceDiagram
    participant R as Recepción
    participant D as Doctor
    participant API
    participant DB
    R->>API: check-in cita
    D->>API: abrir encuentro (DRAFT)
    API->>DB: crea encounter + audit(READ/CREATE)
    D->>API: guardar SOAP + payload especialidad (autoguardado)
    D->>API: firmar
    API->>API: reglas de firma (módulo especialidad + núcleo)
    API->>DB: SIGNED + content_hash + audit(SIGN)
    D->>API: adenda (si hay corrección)
    API->>DB: addendum + audit(AMEND)
```

## 5. Fase 1 — componentes implementados (backend)
| Capa | Módulos |
|---|---|
| `domain` | `enums`, `password_policy`, `audit_chain`, `policies/permissions` (RBAC) |
| `models` | `user` (User, UserRole, DoctorProfile, DoctorSpecialty, RefreshToken), `audit_log` |
| `repositories` | `users`, `refresh_tokens`, `audit`, `unit_of_work` |
| `services` | `auth`, `users`, `audit` |
| `schemas` | `auth`, `users`, `audit` |
| `api/v1` | `auth` (login/refresh/logout/me), `users` (CRUD), `audit` (listar/verificar) |
| `core` | `security` (Argon2id, JWT, refresh), `clock`, `config` (cookies, bloqueo) |
| `scripts` | `seed.py` (8 usuarios demo), `export_openapi.py` |

## 6. Fase 1 — componentes implementados (frontend)
| Zona | Contenido |
|---|---|
| `app/` | `AppLayout`, `navigation`, `guards/{RequireAuth,RoleGuard}`, `router`, `providers` |
| `shared/lib` | `http` (refresh único + reintento), `accessToken` (solo memoria), `apiError`, `labels`, `dates` (Lima), `passwordPolicy` |
| `shared/ui` | Alert, Badge, Button, CheckboxGroup, Field, Input/Select, Pagination, Spinner, Table |
| `entities/user` | `permissions` (`can`, `canAssignRole`, `canManageUser`) |
| `features/auth` | `AuthProvider`, `useAuth`, `LoginForm`, `useIdleLogout` |
| `features/users` | `UsersManager`, `UsersTable`, `UserCreateForm`, `UserEditForm`, `RoleCheckboxes` |
| `features/audit` | `AuditPanel`, `AuditTable`, `IntegrityCheck` |
| `pages/` | Home, Login, Users, Audit, Forbidden, NotFound |
Rutas: `/login` (pública) · `/` · `/usuarios` y `/auditoria` (OWNER/SUPERUSER).

## 7. Estado
Ver `LOGS.md`. Hoy: Fases 0 y 1 completas (backend + frontend).
