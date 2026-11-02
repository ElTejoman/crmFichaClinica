# 00 · Plan maestro

> Documento vivo. Cada fase cierra con: código + pruebas + docs + entrada en `LOGS.md` + actualización de `GRAPH.md`.
> Estado actual: ver `LOGS.md`.

## 1. Objetivo
CRM web para una clínica de una sede en Lima con **acupuntura, nutrición, quiropraxia, sueroterapia y odontología**: pacientes y agenda por especialidad, **ficha clínica híbrida** (núcleo común + módulo por especialidad), CRM de posibles clientes y roles (superuser, dueño-doctor, doctor, recepción, paciente).

## 2. Principios rectores
1. **Seguridad clínica y legal primero**: inmutabilidad, trazabilidad, consentimiento, mínimo privilegio.
2. **Clean code**: capas estrictas, funciones pequeñas, nombres claros, comentarios que explican el *por qué*, tipado estricto (mypy/TS strict), cero lógica de negocio en routers/componentes.
3. **Vertical slices**: cada fase entrega algo usable de punta a punta (BD → API → UI → tests).
4. **Configurable sobre codificado**: plantillas y plazos normativos como datos (la normativa **[VERIFICAR]** cambia).
5. **Trazable**: cada decisión en ADR, cada avance en `LOGS.md`, cada estructura en `GRAPH.md`.
6. **Probado**: no se marca nada "hecho" sin tests que pasen.

## 3. Fases

| Fase | Entregable | Criterio de aceptación |
|---|---|---|
| **0 · Cimientos** | Estructura de repo, `docker-compose.yml` (db+api+web), Dockerfiles, linters, pre-commit, CI (GitHub Actions), health checks, tests de arquitectura | `docker compose up` levanta todo; `/health` OK; lint+tests verdes |
| **1 · Identidad y seguridad** | Usuarios, multi-rol, login/refresh, Argon2id, RBAC (`require_role`), auditoría con hash encadenado, pantalla login y layout por rol | Tests de permisos por rol; auditoría registra login/denegaciones; cadena de hash verificable |
| **2 · Pacientes + CRM** | CRUD pacientes (+HC creada automáticamente), detección de duplicados, apoderado en menores; leads con embudo Kanban, actividades, conversión lead→paciente | Conversión conserva origen; unicidad documento; búsqueda < 300 ms |
| **3 · Agenda** | Horarios de doctor, excepciones, salas, citas por especialidad, sin solapamientos, calendario día/semana, check-in, series de sesiones | Constraint anti-solape; estados de cita; vista calendario por doctor/especialidad |
| **4 · Núcleo clínico** | HC: resumen, alergias, medicación, antecedentes, encuentros SOAP, vitales, CIE-10, consentimientos, adjuntos, firma, adendas, timeline, banderas, exportar PDF | Firmar bloquea edición; adenda versionada; checklist de completitud; auditoría de lecturas |
| **5 · Módulos de especialidad** (uno por entrega) | 5a Nutrición · 5b Acupuntura (mapa de puntos) · 5c Quiropraxia (banderas rojas, escalas) · 5d Sueroterapia (lotes, vitales seriados) · 5e Odontología (odontograma/periodontograma) | Cada módulo: esquema Pydantic + UI + reglas de firma + tests + datos de ejemplo |
| **6 · Roles de cierre** | Tablero dueño (KPIs), portal del paciente (citas, resumen, solicitudes ARCO), break-glass | KPIs correctos sobre seed; paciente solo ve lo suyo |
| **7 · Hardening y entrega** | 2FA TOTP, rate limiting, cabeceras de seguridad, backups, seed completo, e2e Playwright, documentación de despliegue y de seguridad (documento de seguridad Ley 29733) | Suite e2e verde; checklist de seguridad cumplido |
| **Fase 2 (futuro)** | Pagos y paquetes, inventario por lote, recordatorios WhatsApp/email, firma digital, interoperabilidad FHIR/RENHICE | Fuera del alcance inicial |

### Orden de especialidades y por qué
Nutrición (formularios + gráficos, bajo riesgo) → Acupuntura (SVG de puntos) → Quiropraxia (reglas de bandera roja) → Sueroterapia (trazabilidad de lote, series de vitales) → Odontología (odontograma SVG es lo más complejo). Cada una valida una pieza distinta del patrón `SpecialtyModule` antes de la más difícil.

## 4. Estrategia de pruebas
- **Unit**: dominio (políticas, reglas de firma, cálculos IMC/requerimientos, banderas rojas).
- **Integración**: API + Postgres real (permisos por rol, inmutabilidad, solapamiento de citas, auditoría).
- **Arquitectura**: test que falla si `api` importa `models` o `domain` importa `fastapi`/`sqlalchemy`.
- **Frontend**: Vitest + Testing Library (componentes críticos: odontograma, SOAP, guards).
- **E2E**: Playwright (login por rol, lead→paciente→cita→ficha→firma→adenda).
- **Contrato**: CI regenera tipos OpenAPI y falla si hay diff.

## 5. Calidad y flujo de trabajo
- Rama de trabajo: `claude/intelligent-bardeen-6xu34r`. Commits pequeños y descriptivos (Conventional Commits).
- pre-commit: ruff, ruff-format, mypy, eslint, prettier, tsc.
- Definición de "hecho": código + tests verdes + docs + `LOGS.md` + `GRAPH.md` actualizados.

## 6. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Normativa peruana no verificada (NTS 139, firma, retención) | Parámetros/plantillas configurables; lista de **[VERIFICAR]**; validación por asesor legal antes de producción real |
| Banderas rojas de quiropraxia basadas en fuentes débiles | Validación clínica por el quiropráctico/dueño antes de uso real; son *avisos*, no diagnóstico |
| Datos sensibles de salud | Mínimo privilegio, auditoría, cifrado en tránsito, secretos por entorno, sin PII en logs |
| Complejidad del odontograma | Última especialidad; componente SVG aislado y probado |
| No poder correr Docker Desktop del usuario | Verificación aquí (Docker CLI/daemon si existe, o procesos nativos); el usuario valida con `docker compose up` |
| Alcance creciente | Fase 2 explícita; todo lo no listado se negocia |

## 7. Qué necesito del dueño (no bloquea Fase 0-3)
1. Confirmar categoría IPRESS y responsables por especialidad (colegiatura).
2. Validar plantillas de ficha con un doctor de cada especialidad (yo dejo un borrador razonable).
3. Textos de consentimiento informado (dejo plantillas de ejemplo **no legales**).
4. Logo/colores si luego los desea (por ahora: estilo clínico neutro, verde-azulado).

## 8. Entorno de desarrollo en la nube
- Python 3.13, Node 22, Docker CLI presentes; registros pip/npm accesibles. Disponibilidad del daemon Docker y de PostgreSQL se verifica en Fase 0 y se anota en `LOGS.md`.
