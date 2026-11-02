---
name: clinical-specialty-module
description: Agregar o modificar el módulo clínico de una especialidad (acupuntura, nutrición, quiropraxia, sueroterapia, odontología) end-to-end usando el patrón SpecialtyModule. Usar al trabajar en cualquier ficha específica.
---

# Procedimiento: módulo de especialidad

Referencias obligatorias: `docs/05-FICHAS-POR-ESPECIALIDAD.md`, payload en `docs/03-MODELO-DE-DATOS.md` §3, hallazgos en `docs/01-...md` §4.

**Backend** (`app/domain/specialties/<x>.py`)
1. Definir `PayloadV1(BaseModel)` estricto (`extra="forbid"`, rangos y enums). `schema_version = 1`.
2. Implementar `SpecialtyModule`: `required_for_signing`, `consents_required`, `red_flags`.
3. Registrar en `registry.py`. Sin tocar el núcleo clínico.
4. Cálculos clínicos (IMC, requerimientos…) en funciones puras con tests de valores conocidos.
5. Tests: payload válido/ inválido, reglas de firma (qué falta), consentimientos exigidos, banderas rojas.

**Frontend** (`features/clinical-record/specialties/<x>/`)
6. Componente de módulo autocontenido (pestañas/acordeones), recibe/emite el payload tipado.
7. Interacciones propias (mapa de puntos, esquema vertebral, odontograma, gráficos) como componentes aislados con tests.
8. Mostrar el checklist de "falta para firmar" proveniente del backend (una sola fuente de verdad).

**Seed y cierre**
9. Añadir 2–3 encuentros de ejemplo en `scripts/seed.py` (datos ficticios, nunca reales).
10. Si cambia el esquema ⇒ subir `schema_version` y migrar; **nunca** reescribir encuentros firmados.
11. Actualizar `GRAPH.md`, `LOGS.md`; lo normativo dudoso se deja **[VERIFICAR]**.
