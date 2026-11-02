---
name: frontend-feature
description: Implementar una funcionalidad del frontend React+TypeScript con arquitectura por features, tipos generados de OpenAPI, validación Zod, accesibilidad y tests. Usar al crear pantallas o componentes de este proyecto.
---

# Procedimiento: nueva feature frontend

Antes: leer `CLAUDE.md`, `docs/02-ARQUITECTURA.md` (§3 y §4) y `docs/05-FICHAS-POR-ESPECIALIDAD.md` si es clínica.

1. **Tipos**: regenerar `shared/types/api.d.ts` desde `/openapi.json`; no escribir tipos de API a mano.
2. **Estructura** en `src/features/<x>/`: `api/` (hooks TanStack Query), `components/`, `hooks/`, `schemas.ts` (Zod), `index.ts` (API pública). Una feature **no** importa de otra feature.
3. **Formularios**: React Hook Form + Zod; mensajes en español; deshabilitar envío mientras guarda; autoguardado en fichas clínicas.
4. **Autorización de UI**: `RoleGuard`/`can(permission)` solo para ocultar; el servidor decide.
5. **UX clínica**: información crítica (⚠️ alergias) siempre visible; estados vacíos, carga y error; atajos de teclado; tablet-friendly.
6. **Accesibilidad**: etiquetas, foco visible, contraste AA, navegación por teclado (Radix).
7. **Tests**: Vitest + Testing Library de los flujos y reglas (p. ej. no permitir firmar con checklist incompleto).
8. **Cierre**: `npm run lint && npm run typecheck && npm run test` verdes → actualizar `GRAPH.md` y `LOGS.md`.

Prohibido: `any`, fetch directo en componentes (usar hooks de `api/`), guardar datos clínicos en `localStorage`.
