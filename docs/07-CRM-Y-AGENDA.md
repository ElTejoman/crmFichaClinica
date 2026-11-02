# 07 · CRM (posibles clientes) y Agenda

## 1. CRM
**Embudo**: `NEW → CONTACTED → QUALIFIED → APPOINTMENT_SET → CONVERTED` (+ `LOST` con motivo).

| Elemento | Detalle |
|---|---|
| Captura | Manual (recepción), importación CSV, formulario web (fase 2) |
| Campos | nombre, teléfono (WhatsApp), email, especialidades de interés, origen, notas, consentimiento de marketing (Ley 29733) |
| Vista | Kanban arrastrable + tabla filtrable; buscar por teléfono |
| Actividad | llamadas, WhatsApp, notas; **próxima acción** con fecha → widget "seguimientos de hoy" |
| Conversión | botón "Convertir en paciente": pre-rellena datos, crea `Patient` + HC, liga `converted_patient_id`, conserva fuente |
| Métricas (OWNER) | leads por origen, tasa de conversión, tiempo medio a primera cita, motivos de pérdida, por especialidad |
| Privacidad | Los leads **no** tienen datos clínicos; no se envía publicidad sin consentimiento |
| Deduplicación | alerta si el teléfono/email ya existe como lead o paciente |

## 2. Agenda
- **Entidades**: horario semanal por doctor, excepciones (vacaciones, feriados), salas/camillas, tipos de cita por especialidad (duración por defecto: ej. primera consulta 60 min, control 30 min — configurables).
- **Reglas**: sin solapamiento por doctor y por sala (constraint de exclusión en PostgreSQL); cita dentro del horario; el doctor solo ofrece sus especialidades.
- **Estados**: `SCHEDULED → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED` y `NO_SHOW`/`CANCELLED` (con motivo).
- **Sesiones en serie**: acupuntura/quiropraxia/sueroterapia admiten "paquete de N sesiones" (`series_id`).
- **Vistas**: día/semana por doctor y por especialidad; lista del día para recepción; "mi día" del doctor con un clic a abrir la ficha.
- **Flujo recepción**: confirmar → check-in → el paciente aparece en la cola del doctor.
- **Recordatorios**: fase 2 (plantillas de WhatsApp/email). En fase 1 se genera lista de "citas de mañana" para llamar/enviar manualmente.
- **Notas administrativas** de la cita **no** contienen datos clínicos (campo separado, visible a recepción).
