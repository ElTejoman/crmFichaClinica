# 01 · Investigación: uso correcto de una ficha clínica

> Fecha de investigación: 2026-11-02 · Contexto: clínica multiespecialidad en Lima, Perú.
> Leyenda de confianza: ✅ confirmado en fuente consultada · ⚠️ fuente secundaria / débil · **[VERIFICAR]** no se pudo leer el texto oficial; debe validarlo el dueño o un asesor legal antes de producción.

## 0. Metodología y límites (honestidad ante todo)

- Se consultaron búsquedas web (normativa peruana, guías de documentación por especialidad, seguridad de HCE).
- **No se pudo leer el texto oficial de la NTS 139-MINSA/2018/DGAIN**: los dominios `cmp.org.pe` y `busquedas.elperuano.pe` no resuelven desde el entorno en la nube. Todo lo que dependa de su articulado queda como **[VERIFICAR]**.
- Este documento **no es asesoría legal**. Sirve para diseñar el software de modo que cumplir sea fácil y *configurable*.
- Los campos obligatorios se modelan como **configuración/plantilla versionada**, no como código rígido: si la norma cambia, se cambia una plantilla.

## 1. Marco normativo (Perú) y su impacto en el diseño

| Norma | Qué aporta (según fuentes consultadas) | Confianza | Impacto en el software |
|---|---|---|---|
| **Ley 26842** Ley General de Salud (art. 29: el acto médico se sustenta en historia clínica veraz y suficiente) | Base de la obligación de historia clínica | ⚠️ | Toda atención exige registro; sin ficha firmada no hay "atención completada". |
| **Ley 29414** Derechos de los usuarios | Derecho a acceder y obtener copia de su historia; consentimiento informado | ⚠️ | Función "exportar HC en PDF" + solicitud de copia con registro en auditoría. |
| **NTS 139-MINSA/2018/DGAIN** (RM 214-2018/MINSA; modif. RM 265-2018/MINSA) | Gestión de la historia clínica: contenido básico estandarizado, formatos, conservación, HC electrónica | ✅ existe y está vigente (citada en resoluciones 2019-2025); contenido **[VERIFICAR]** | Núcleo común de la ficha; HC única por paciente; plazos de conservación configurables. |
| **NTS 150 – Odontograma** (MINSA/DGIESP) | Modelo estandarizado y obligatorio de odontograma en instituciones públicas y privadas | ⚠️ (tesis peruanas) **[VERIFICAR número/año]** | El odontograma debe seguir la simbología oficial peruana; no inventar una propia. |
| **Ley 29733** + **DS 016-2024-JUS** (nuevo reglamento, vigente desde ~30/03/2025) | Datos de salud = datos sensibles; derechos ARCO ampliados (portabilidad, desindexación); documento de seguridad obligatorio (art. 47.1) | ✅ | Consentimiento de tratamiento de datos, registro de bancos de datos, documento de seguridad, auditoría, minimización. Ver `06-SEGURIDAD-Y-CUMPLIMIENTO.md`. |
| **Ley 30024** (RENHICE) + **DS 009-2017-SA** + modif. **DS 020-2025-SA** (adecúa a Ley 31750) | Registro Nacional de HC Electrónicas, interoperabilidad; acceso a info clínica conforme a Ley 29733; "información clínica sensible" la define el paciente | ✅ | Diseñar la HC con **modelo interoperable (inspirado en FHIR R4)** y marca de "información sensible" por decisión del paciente. |
| **Consentimiento informado** — precedente de observancia obligatoria (Indecopi) y art. 15 Ley 26842 | Para procedimientos de riesgo el consentimiento debe constar por escrito; para otros puede ser verbal con constancia | ⚠️ resultados contradictorios | Consentimiento **escrito/firmado** para: sueroterapia, quiropraxia (manipulación), acupuntura invasiva/moxa/ventosas, odontología (procedimientos). Verbal registrado para el resto. |
| **Conservación** (se recuerda 20 años: activo+pasivo) | No confirmado en esta investigación | **[VERIFICAR]** | Parámetro `RETENTION_YEARS` configurable; **prohibido borrado físico** de datos clínicos. |
| **Firma digital / electrónica** (Ley 27269 y complementarias) | No verificado | **[VERIFICAR]** | Fase 1: "firma" = autenticación reforzada + sello de tiempo + hash. Fase futura: integración con firma digital (RENIEC/ECEP) si la clínica lo exige. |
| **Registro del establecimiento / profesionales** (IPRESS en RENIPRESS/SUSALUD; colegiatura CMP, COP, CNP, etc.) | No investigado en profundidad | **[VERIFICAR]** | Cada doctor tiene `licencia_profesional` + colegio + RNE (si aplica); impresión/PDF muestra firma y sello (número de colegiatura). |

> **Pendiente para el dueño**: confirmar la categoría IPRESS de la clínica, si la sueroterapia exige médico o enfermera responsable, y qué colegio/registro respalda a quiropraxia y acupuntura. El sistema incluirá campos para ello.

## 2. Principios de una ficha clínica bien hecha (aplicables a todas)

Estándar de integridad de datos **ALCOA+** (usado en registros regulados) traducido a requisitos:

| Principio | Requisito en el sistema |
|---|---|
| **A**tribuible | Cada entrada guarda `created_by`, rol, especialidad, fecha/hora (UTC + Lima). |
| **L**egible | Texto estructurado, sin letra manuscrita; vocabularios controlados (CIE-10). |
| **C**ontemporáneo | Marca de tiempo del servidor; no se permite "fecha de atención" futura; retroactivos requieren motivo. |
| **O**riginal | Notas firmadas son **inmutables**; cambios = *adenda* versionada con motivo. |
| **E**xacto | Validaciones (rangos de signos vitales, unidades, cálculo de IMC server-side). |
| Completo | Campos obligatorios por plantilla antes de poder **firmar**; checklist de completitud visible. |
| Consistente | Una sola HC por paciente; alergias/medicación compartidas entre especialidades. |
| Duradero | Sin borrado físico; backups; retención configurable. |
| Disponible | Búsqueda, exportación PDF, copia al paciente, historial cronológico. |

## 3. Estructura común de la ficha (núcleo)

Combinando buenas prácticas internacionales (SOAP, resumen del paciente tipo FHIR) y el enfoque de la NTS 139 **[VERIFICAR contra texto]**:

1. **Identificación**: nº de HC (único), DNI/CE/pasaporte, nombres, fecha de nacimiento, sexo, estado civil, ocupación, domicilio, teléfono, email, contacto de emergencia, apoderado (menores/incapaces), seguro (si aplica), fuente de referencia (CRM).
2. **Consentimientos**: tratamiento de datos (Ley 29733), consentimiento general de atención, consentimientos específicos por procedimiento (con versión del texto, fecha, firma, testigo si aplica).
3. **Antecedentes** (longitudinales, compartidos): alergias (con severidad), medicación actual, antecedentes personales/familiares, quirúrgicos, hábitos (tabaco, alcohol, sueño, actividad), gineco-obstétricos (si aplica), vacunas relevantes.
4. **Atención / Evolución** (por visita, formato **SOAP**):
   - **S** Motivo de consulta, enfermedad actual (inicio, localización, intensidad EVA 0-10, factores agravantes/aliviantes), revisión por sistemas.
   - **O** Signos vitales (PA, FC, FR, T°, SatO₂, peso, talla, IMC), examen físico, hallazgos del módulo de especialidad.
   - **A** Diagnósticos (**CIE-10**, principal/secundarios, presuntivo/definitivo), banderas rojas evaluadas.
   - **P** Plan de tratamiento, indicaciones, prescripciones, derivaciones, próxima cita, educación al paciente, criterios de alta.
5. **Resultados y adjuntos**: laboratorio, imágenes, informes, fotos (con consentimiento).
6. **Cierre**: firma del profesional, nº de colegiatura, fecha/hora, hash de integridad; adendas posteriores visibles.
7. **Trazabilidad**: registro de accesos, ediciones, impresiones y exportaciones.

## 4. Hallazgos por especialidad (qué debe llevar el módulo)

### 4.1 Acupuntura ⚠️
- Guías de notas clínicas de asociaciones de acupuntura (NZ) piden: **todos los puntos usados**, servicios complementarios (moxa, ventosas, electroestimulación), y **nombrar el estilo** si no es MTC estándar.
- Consentimiento específico para técnicas de mayor riesgo: **gua sha, ventosas, moxa con cicatriz, sangrado, hilos**.
- Diagnóstico en términos MTC (lengua, pulso, patrón de síndrome) **y** traducción a lenguaje biomédico para que otros profesionales entiendan la nota.
- No hallé fuente fiable para calibre/profundidad/tiempo de retención de agujas → se modelan como campos **opcionales** por punto (el doctor decide).
- **Módulo**: anamnesis MTC, lengua (color/forma/saburra), pulso (posiciones), patrón/principio terapéutico, **mapa corporal interactivo de puntos** (catálogo OMS), técnica por punto (aguja, moxa, ventosa, electro, láser), nº de agujas, reacciones adversas (hematoma, mareo/síncope), evolución EVA.

### 4.2 Nutrición ⚠️
- Estándar **Nutrition Care Process (NCP) / ADIME**: Evaluación → Diagnóstico nutricional → Intervención → Monitoreo y evaluación.
- Diagnóstico nutricional en formato **PES** (Problema – Etiología – Signos/síntomas), **distinto** del diagnóstico médico (error común: ponerlo en la sección equivocada).
- Datos de evaluación: antropometría, bioquímica, historia clínico-dietaria, ingesta.
- **Módulo**: antropometría (peso, talla, IMC, circunferencias, pliegues, % grasa, masa magra), recordatorio 24 h / frecuencia de consumo, laboratorio relevante, diagnóstico PES, requerimientos (Harris-Benedict/Mifflin calculados server-side), plan alimentario, metas SMART, **gráficos de tendencia**.

### 4.3 Quiropraxia ⚠️ (fuentes: Noridian Medicare, ACA/PART)
- Marco **PART** (Dolor/sensibilidad, Asimetría, Rango de movimiento, Tono tisular) para sustentar hallazgos.
- Debe documentarse el **segmento vertebral exacto** tratado cada día ("región" no basta).
- Hallazgos objetivos más allá de "dolor y tensión": ROM medido, pruebas ortopédicas (Lasègue/SLR, Spurling…), neurológicas, palpación.
- **Medidas de resultado funcional** (Oswestry, NDI, EVA) para demostrar progreso y decidir el alta.
- Evitar **notas clonadas** entre visitas (riesgo de auditoría): el sistema avisará si el texto libre es idéntico a la visita previa.
- **Banderas rojas antes de manipular** (⚠️ fuentes de baja autoridad; **requiere validación clínica**): síntomas de cauda equina (anestesia en silla de montar, disfunción vesical/intestinal), sospecha de disección arterial vertebral (dolor cervical súbito + mareo/vértigo), trauma reciente/caída significativa, osteoporosis severa, cáncer, anticoagulación, déficit neurológico progresivo. Si hay banderas → bloqueo suave: se exige justificar o derivar.
- **Módulo**: pruebas ortopédicas/neurológicas, ROM, evaluación postural, segmentos ajustados + técnica, cuestionarios funcionales con puntaje, checklist de banderas rojas, consentimiento firmado.

### 4.4 Sueroterapia ⚠️ (fuente: guía regulatoria de Nuevo México + plantillas)
- Debe quedar documentado: **justificación clínica, indicación/prescripción de profesional autorizado, historia, alergias, medicación, contraindicaciones, consentimiento**, notas de administración, **número de lote** de cada producto, resultados.
- **Signos vitales antes, durante (intervalos) y después**; registro de cambios de velocidad de infusión y de **reacciones adversas** con acción tomada.
- Plantillas comerciales: sitio de punción, calibre del catéter, lote, consentimiento en archivo, checklist de reacciones (extravasación, flebitis, hipotensión, fiebre).
- **Módulo**: tamizaje de contraindicaciones (G6PD, insuficiencia renal/cardiaca, embarazo, alergias), prescripción del protocolo (componentes, dosis, volumen, velocidad), sitio/calibre, **lote y vencimiento por componente** (trazabilidad), vitales seriados, reacciones, hora inicio/fin, quién administró y quién prescribió.
- Fase 2: inventario con descuento automático por lote.

### 4.5 Odontología ⚠️ (tesis peruanas)
- **Odontograma estandarizado obligatorio** (NTS 150 **[VERIFICAR]**), historia clínica según NTS 139, **consentimiento informado** con baja adherencia en estudios locales (62 % en una muestra) → el sistema lo vuelve **requisito de bloqueo** antes de firmar el procedimiento.
- **Módulo**: odontograma interactivo (dentición permanente/temporal, 32/20 piezas, 5 caras por pieza, simbología peruana: caries, obturación, corona, ausente, implante, endodoncia…), odontograma inicial vs. evolutivo, periodontograma (profundidad de sondaje, sangrado, movilidad), índice de higiene, oclusión, plan de tratamiento por pieza con presupuesto (fase 2), prescripción.

## 5. Seguridad y trazabilidad de la HC (benchmarks)

Fuente: resúmenes de la HIPAA Security Rule (§164.312) ⚠️ — se usa **solo como referencia de buenas prácticas**, no es ley peruana.
- Control de acceso por rol, autenticación fuerte, **registro de auditoría** (quién, qué, cuándo, desde dónde), integridad, seguridad en tránsito.
- **Acceso de emergencia ("break-glass")**: permitido, con motivo, limitado en tiempo, registrado y revisado.
- Logs resistentes a manipulación (encadenamiento por hash).
- Ver decisiones en `06-SEGURIDAD-Y-CUMPLIMIENTO.md`.

## 6. Huecos típicos de una ficha clínica → cómo los cerramos

| # | Hueco común | Mitigación en el sistema |
|---|---|---|
| 1 | Notas sin autor/fecha fiable | Atribución automática + hora del servidor |
| 2 | Notas editadas sin rastro | Firma → inmutable; adendas con motivo; historial de versiones |
| 3 | Alergias/medicación desactualizadas | Banner persistente + "revisar en cada visita" (confirmación obligatoria) |
| 4 | Consentimiento ausente | Bloqueo de firma si el procedimiento exige consentimiento y no existe |
| 5 | Diagnósticos en texto libre | CIE-10 con buscador; ≥1 diagnóstico para firmar |
| 6 | Notas copiadas/clonadas | Detector de similitud con visita previa |
| 7 | Pérdida de seguimiento | Plan + próxima cita + tareas pendientes; widget "pacientes sin control > N días" |
| 8 | Falta de trazabilidad de insumos (sueros) | Lote/vencimiento por componente |
| 9 | Acceso indebido (curiosear) | RBAC + relación terapéutica + auditoría + alertas |
| 10 | Datos de contacto de menores | Apoderado obligatorio si < 18 años |
| 11 | Datos duplicados de pacientes | Unicidad por documento + detección fuzzy de duplicados |
| 12 | Derechos ARCO sin canal | Módulo de solicitudes (acceso/rectificación/cancelación/oposición/portabilidad) |
| 13 | Sin resultado medible | Escalas funcionales por especialidad (EVA, NDI, Oswestry, IMC, etc.) |
| 14 | Derivaciones sin cierre | Registro de derivación y contrarreferencia |
| 15 | Fotos/archivos sin consentimiento | Adjuntos exigen flag de consentimiento |

## 7. Fuentes consultadas

- NTS 139: [El Peruano](https://busquedas.elperuano.pe/api/visor_html/1626125-1) · [CMP (PDF)](https://www.cmp.org.pe/wp-content/uploads/2020/02/NTHC.pdf) · [RM 214-2018 (BVS)](https://docs.bvsalud.org/biblioref/2019/02/969231/rm_214-2018_minsa.pdf) *(no accesibles desde el entorno; solo metadatos de la búsqueda)*
- Protección de datos: [DS 016-2024-JUS (Congreso)](https://www.congreso.gob.pe/Docs/DGP/DIDP/files/ds_016-2024-jus.pdf) · [LP Derecho](https://lpderecho.pe/reglamento-ley-proteccion-datos-personales-decreto-supremo-016-2024-jus/)
- RENHICE: [DS 020-2025-SA](https://lpderecho.pe/modifican-reglamento-ley-crea-registro-nacional-historias-clinicas-electronicas-renhice-decreto-supremo-020-2025-sa/)
- Consentimiento: [Precedente de observancia obligatoria](https://lpderecho.pe/precedente-obsevancia-obligatoria-consentimiento-informado-entidades-salud/)
- Acupuntura: [Acupuncture NZ – Guidelines for Clinical Notes 2021](https://www.acupuncture.org.nz/assets/Guidelines-for-Clinical-Notes-December-2021-v2.pdf) · [Maryland SOAP template](https://health.maryland.gov/bacc/Documents/SOAP%20Note%20Template.pdf)
- Quiropraxia: [Noridian – Chiropractic documentation](https://med.noridianmedicare.com/web/jfb/specialties/chiropractic/documentation-guidelines) · [NZ Physiotherapy Board – cervical manipulation](https://www.physioboard.org.nz/standards/physiotherapy-standards/cervical-manipulation-standard)
- Sueroterapia: [New Mexico Medical Board – IV therapy](https://www.nmmb.state.nm.us/wp-content/uploads/2025/01/Intravenous-IV-Therapy.pdf)
- Nutrición: [Resumen NCP/ADIME](https://open-exam-prep.com/study-guides/registered-dietitian/nutrition-care-assessment-diagnosis/nutrition-care-process) *(fuente débil; validar con material de la Academy of Nutrition and Dietetics)*
- Odontología: [Tesis UCSM – auditoría de HC odontológicas](https://repositorio.ucsm.edu.pe/bitstreams/16275941-3a6f-4b5a-a049-44b5f50f1981/download)
- Seguridad: [Resumen HIPAA technical safeguards](https://www.accountablehq.com/post/hipaa-security-rule-technical-safeguards-explained-with-real-world-scenarios)
