# 05 · Diseño de la ficha por especialidad (UX y reglas)

Todas comparten el **núcleo** (SOAP, vitales, diagnósticos CIE-10, consentimientos, adjuntos, firma). Aquí se define el **módulo** de cada una: secciones, interacciones, validaciones y *reglas de firma*.

## Núcleo común (todas)
**Pantalla**: barra superior con paciente (nombre, edad, HC, ⚠️ alergias en rojo) · timeline izquierda · editor central · resumen derecho.

**Reglas de firma (todas)**: motivo de consulta, ≥1 diagnóstico CIE-10, plan, signos vitales mínimos (o marcar "no aplica" con motivo), consentimiento general vigente, alergias/medicación **revisadas hoy** (checkbox obligatorio).

## 1. Nutrición
- **Secciones**: Antropometría · Historia dietética (recordatorio 24 h, frecuencia) · Laboratorio · Diagnóstico PES · Requerimientos · Plan alimentario · Metas · Seguimiento.
- **Interacciones**: IMC y % de riesgo calculados al escribir; gráficos de peso/cintura/% grasa en el tiempo; generador de plan por comidas (tabla editable); comparador "hoy vs. última visita".
- **Reglas de firma**: peso+talla, ≥1 PES, requerimiento calórico, ≥1 meta.
- **Reglas de dominio**: Mifflin-St Jeor / Harris-Benedict en el servidor; alertas por IMC extremo o pérdida > X %/mes.

## 2. Acupuntura
- **Secciones**: Anamnesis MTC · Lengua · Pulso · Patrón y principio terapéutico · **Mapa de puntos** · Técnicas complementarias · Reacciones adversas · EVA pre/post.
- **Interacciones**: silueta SVG (frente/espalda/mano/oreja) donde se hace clic para añadir un punto (autocompletado por código OMS); lista de puntos con lado (I/D/B), técnica y parámetros opcionales; "repetir puntos de la última sesión".
- **Reglas de firma**: patrón MTC, ≥1 punto, nº de agujas colocadas **y retiradas** (control de seguridad), consentimiento invasivo; consentimiento específico si moxa/ventosas/gua sha.
- **Seguridad**: aviso por embarazo + puntos contraindicados (catálogo configurable), anticoagulantes, marcapasos con electro.

## 3. Quiropraxia
- **Secciones**: **Banderas rojas** (se muestra primero) · Historia del dolor · ROM · Pruebas ortopédicas/neurológicas · Postura · PART · Ajustes (segmento+técnica) · Escalas funcionales.
- **Interacciones**: esquema vertebral SVG (C1–S1) para marcar segmentos; tabla ROM con grados; pruebas con resultado (+/−/dudoso) por lado; gráfico de evolución ODI/NDI/EVA.
- **Reglas de firma**: banderas rojas contestadas; si alguna es positiva → exige **justificación o derivación** (no se puede firmar un ajuste cervical con bandera vascular sin override documentado); ≥1 hallazgo objetivo medible; segmento exacto ajustado; escala funcional en visita inicial y cada N visitas.
- **Anti-clonado**: advertencia si S/O/A/P es idéntico a la visita previa.

## 4. Sueroterapia
- **Secciones**: Tamizaje de contraindicaciones · Prescripción (protocolo) · Acceso venoso · Componentes con **lote/vencimiento** · Administración (inicio/fin, velocidad) · **Vitales seriados** · Reacciones adversas · Alta.
- **Interacciones**: protocolo predefinido que rellena componentes; escaneo/entrada de lote; gráfico de vitales; temporizador de infusión; botón rojo "Reacción adversa" que abre protocolo de acción.
- **Reglas de firma**: prescriptor identificado (doctor), tamizaje completo, consentimiento IV firmado, vitales pre y post, lote y vencimiento de **todos** los componentes (no vencidos), responsable de administración.
- **Alertas**: alergia a componente, G6PD pendiente (vitamina C alta dosis), embarazo, falla renal/cardiaca.

## 5. Odontología
- **Secciones**: Anamnesis odontológica · Examen extraoral/intraoral · **Odontograma** (inicial/evolutivo) · Periodontograma · Oclusión · Diagnóstico · Plan por pieza · Procedimientos realizados · Prescripción.
- **Interacciones**: odontograma SVG con 32/20/mixta; clic en pieza → panel con 5 caras (O, M, D, V, L) y estados oficiales; deshacer/rehacer; leyenda; comparar inicial vs. actual; periodontograma con teclado numérico veloz (6 sitios/pieza).
- **Reglas de firma**: odontograma inicial en 1.ª visita, consentimiento de procedimiento, plan por pieza, procedimiento ligado a pieza/diagnóstico.
- **Nota**: simbología según norma peruana **[VERIFICAR NTS]**; si difiere, se ajusta el catálogo `dental_symbols` sin tocar código.

## Plantillas versionadas
Cada módulo lleva `schema_version`. Cambiar campos ⇒ nueva versión del esquema + migración de payloads antiguos (los antiguos siguen mostrándose con su versión original; **nunca** se reescribe historia firmada).
