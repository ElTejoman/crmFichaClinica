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


## 3. Implementado en Fase 2 (CRM) — comportamiento real
- **Embudo**: `NEW ↔ CONTACTED ↔ QUALIFIED ↔ APPOINTMENT_SET` se mueven libremente (el Kanban permite arrastrar hacia atrás). `LOST` exige motivo y solo se reabre como `NEW`. `CONVERTED` **no se asigna a mano**: solo por la acción *Convertir en paciente*.
- **Automatización**: registrar una llamada, WhatsApp o correo en un lead `NEW` lo pasa a `CONTACTED`; una nota no. Cada cambio de estado deja una actividad `STATUS_CHANGE`.
- **Próxima acción**: cada actividad puede fijar la siguiente acción; la del lead es la de su **última** actividad (`null` la limpia). *Seguimientos de hoy* = próxima acción vencida o que vence hoy **en hora de Lima**, solo leads abiertos.
- **Duplicados**: al crear un lead se compara teléfono/correo (normalizados) con leads **y** pacientes; devuelve 409 `possible_duplicate` con los candidatos y se puede forzar con `?allow_duplicate=true`.
- **Conversión**: crea paciente + historia clínica y cierra el lead **en una sola transacción** (si cualquier paso falla, nada queda). La fuente del lead se conserva como `referral_source` del paciente. Un lead *perdido* también puede convertirse.
- **Privacidad**: un DOCTOR solo ve los leads que se le asignaron; los leads no contienen datos clínicos.
- **Tablero**: cada lead incluye `assigned_to_name` (cualquier personal, no solo doctores) y `lost_reason` para mostrar "Perdidos" sin pedir cada detalle. `lost_reason` es texto libre: convendría un catálogo de motivos para que las estadísticas agrupen bien.
- **Estadísticas (solo OWNER)**: total, abiertos, convertidos, perdidos, tasa de conversión, y desgloses por estado, fuente, especialidad y motivo de pérdida.
- **Pendiente**: "tiempo medio hasta la primera cita" (requiere agenda, Fase 3); importación CSV y formulario web.

## 4. Implementado en Fase 2 (pacientes)
- Alta con **historia clínica automática** y consentimiento de datos obligatorio; **menores de 18** exigen apoderado (se vuelve a verificar al editar la fecha de nacimiento).
- Documentos: DNI (8 dígitos), CE, pasaporte y otro; únicos por (tipo, número). El formato del CE está **[VERIFICAR]**.
- Teléfonos normalizados a `+51…` para detectar duplicados y usar WhatsApp.
- **Duplicados probables**: mismo nombre aproximado (sin tildes) **y** misma fecha de nacimiento, o mismo teléfono. Homónimos con otra fecha de nacimiento no se marcan. Se muestra el documento enmascarado.
- **Cartera del doctor**: un doctor solo ve pacientes con relación terapéutica activa; sin ella, 403 auditado. Dueño, recepción y superusuario ven todos.
