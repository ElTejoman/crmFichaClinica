# LOGS.md — Bitácora de avance y trazabilidad

> Formato: más reciente arriba. Cada entrada: fecha · fase · qué se hizo · decisiones · pendientes · verificación.
> Estados de fase: ⬜ pendiente · 🟨 en curso · ✅ completada

## Tablero de fases
| Fase | Estado |
|---|---|
| Planificación e investigación | ✅ (pendiente de aprobación del usuario) |
| 0 · Cimientos | ⬜ |
| 1 · Identidad y seguridad | ⬜ |
| 2 · Pacientes + CRM | ⬜ |
| 3 · Agenda | ⬜ |
| 4 · Núcleo clínico | ⬜ |
| 5a Nutrición · 5b Acupuntura · 5c Quiropraxia · 5d Sueroterapia · 5e Odontología | ⬜ |
| 6 · Tablero dueño + portal paciente | ⬜ |
| 7 · Hardening y entrega | ⬜ |

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

**Siguiente paso**: esperar aprobación del plan por el usuario → iniciar Fase 0.
