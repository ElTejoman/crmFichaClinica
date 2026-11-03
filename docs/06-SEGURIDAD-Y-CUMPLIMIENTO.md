# 06 · Seguridad y cumplimiento

> Estado: diseño. Lo normativo marcado **[VERIFICAR]** requiere validación legal.

## 1. Datos personales de salud (Ley 29733 + DS 016-2024-JUS)
| Requisito | Implementación |
|---|---|
| Datos de salud = **sensibles** | Acceso mínimo necesario; cifrado en tránsito (TLS) y secretos fuera del código |
| Consentimiento informado, previo y expreso | `consents.DATA_PROCESSING` obligatorio al registrar paciente; sin él no se abre HC |
| Finalidad y proporcionalidad | Campos justificados en `03-MODELO-DE-DATOS.md`; no se recopila de más |
| Derechos ARCO-PD | Módulo `access_requests` con plazos y trazabilidad; exportación en JSON/PDF (portabilidad) |
| Documento de seguridad (art. 47.1) | Se entrega plantilla en `docs/` en la Fase 7 **[VERIFICAR contenido]** |
| Banco de datos personales | La clínica debe inscribirlo ante la Autoridad (trámite del dueño) **[VERIFICAR]** |
| Notificación de incidentes | Procedimiento descrito en documento de seguridad (fase 7) **[VERIFICAR plazos]** |

## 2. Controles técnicos (OWASP ASVS como guía)
- **Contraseñas**: Argon2id; longitud mínima 12; bloqueo progresivo; sin reutilización inmediata.
- **Sesión**: JWT 15 min + refresh rotativo httpOnly; revocación en logout; 2FA TOTP clínico.
- **Autorización**: servidor siempre decide; verificación de objeto (IDOR) en cada endpoint con `patient_id`.
- **Entrada/Salida**: validación Pydantic estricta; salida con modelos de respuesta explícitos (nunca devolver el modelo ORM); escape por React; CSP.
- **Cabeceras**: HSTS, X-Content-Type-Options, frame-ancestors none, Referrer-Policy.
- **CORS** restringido a orígenes configurados; CSRF mitigado por SameSite=Strict + cabecera personalizada en mutaciones.
- **Rate limiting**: login, búsqueda de pacientes, exportaciones.
- **Archivos adjuntos**: lista blanca de MIME, límite de tamaño, nombres aleatorios, almacenamiento fuera del webroot, hash SHA-256, escaneo opcional.
- **Secretos**: `.env` (no versionado) + `.env.example`; rotación documentada.
- **Dependencias**: `pip-audit` y `npm audit` en CI.
- **Logs**: sin PII ni contenido clínico; `request_id` para correlación.
- **BD**: usuario de aplicación sin DDL; `audit_logs` sin UPDATE/DELETE; backups cifrados.

## 3. Auditoría (append-only, hash encadenado)
```
row_hash = SHA256( prev_hash || ts || actor || action || resource || patient || outcome )
```
- Verificación por API: `GET /audit-logs/verify` recalcula toda la cadena y devuelve la primera fila alterada.
- Se audita **lectura** de fichas, no solo escrituras.
- **Defensa en profundidad (implementado en Fase 1)**: (1) trigger de BD que rechaza `UPDATE/DELETE/TRUNCATE` sobre `audit_logs`; (2) cadena de hash que *detecta* alteración o borrado de filas intermedias; (3) bloqueo consultivo (`pg_advisory_xact_lock`) que serializa las escrituras para que la cadena no se bifurque.
- **Limitación conocida**: la cadena **no detecta el borrado de las últimas filas** (cola), porque no hay una fila posterior que lo revele. Solo el trigger lo impide; un administrador de BD con privilegios podría desactivarlo. Mitigación prevista (Fase 7): exportar periódicamente el último `row_hash` a un almacenamiento externo (ancla) y compararlo en la verificación.
- Vista para el paciente: "quién accedió a mi historia".

## 4. Integridad clínica
- Firma: `content_hash = SHA256(canonical_json(encuentro + payload + vitales + dx))` guardado al firmar; recalculable para probar no alteración.
- Adendas: nuevo registro enlazado; el original permanece intacto.
- Sin borrado físico; "anulación" = estado con motivo y autor.

## 5. Consentimientos
- Plantillas versionadas (`consent_templates`); se guarda **la versión exacta** firmada.
- Firma: captura en pantalla (canvas) + timestamp + dispositivo/IP + testigo opcional. (Equivalencia legal de firma electrónica **[VERIFICAR]**.)
- Revocación posible; la revocación se audita.
- Los textos que entregaré serán **ejemplos no legales**; el dueño debe validarlos con su asesor.

## 6. Disponibilidad y continuidad (fase 7)
- Backup diario `pg_dump` + prueba de restauración documentada.
- Variables de retención (`RETENTION_YEARS`) y reporte de historias próximas a vencer.

## 7. Checklist previo a uso con datos reales
- [ ] Validación legal de plantillas y consentimientos
- [ ] Inscripción del banco de datos / documento de seguridad
- [ ] TLS y dominio configurados, 2FA activo
- [ ] Backups y restauración probados
- [ ] Pen-test básico o revisión de seguridad
- [ ] Capacitación de personal y política de contraseñas

## 8. Implementado en Fase 1 (estado real)
| Control | Implementación | Probado |
|---|---|---|
| Hash de contraseñas | Argon2id; rehash transparente si cambian los parámetros | ✅ unit |
| Anti-enumeración | Misma respuesta 401 para correo inexistente y clave errónea; verificación de relleno para igualar tiempos | ✅ integración |
| Fuerza bruta | 5 fallos → bloqueo 15 min (configurable); se audita | ✅ integración + mutación |
| Access token | JWT 15 min, algoritmo fijo (rechaza `alg=none`), sin roles dentro; el usuario se **recarga de BD en cada petición** → desactivar o cambiar roles surte efecto inmediato | ✅ |
| Refresh token | Opaco, solo se guarda su SHA-256, cookie `httpOnly; SameSite=Strict`, **rotación** y **detección de reutilización** (revoca toda la familia) | ✅ + mutación |
| RBAC | `require_permission` en servidor; cada denegación se audita (`PERMISSION_DENIED`) | ✅ matriz por rol |
| Anti-escalada | Solo SUPERUSER asigna/retira OWNER o SUPERUSER; un OWNER no puede modificar a un SUPERUSER ni desactivarse a sí mismo | ✅ |
| Política de contraseñas | ≥12 caracteres, letra y número, no común, no contiene el correo | ✅ unit |
| Auditoría | Append-only (trigger) + hash encadenado + endpoint de verificación; concurrencia probada con 20 escrituras simultáneas | ✅ |

**Pendiente (Fases 6-7)**: 2FA TOTP, rate limiting por IP, `X-Forwarded-For` desde proxies de confianza, ancla externa del hash de auditoría, lista ampliada de contraseñas comunes, y CSRF adicional si se sirviera el front desde otro origen.

## 9. Implementado en Fase 2 (estado real)
| Control | Implementación | Probado |
|---|---|---|
| Consentimiento de datos (Ley 29733) | Obligatorio al registrar paciente; se guarda la fecha | ✅ |
| Auditoría de lectura de pacientes | Cada `GET /patients/{id}` registra `READ` con `patient_id` | ✅ |
| Auditoría sin datos personales | Se guardan solo **nombres** de campos modificados; test que busca nombre, documento, teléfono y dirección en toda la tabla | ✅ + mutación |
| Mínimo privilegio sobre la cartera | Doctor: solo pacientes con relación activa y leads asignados; denegaciones auditadas | ✅ + mutación |
| Minimización | Listados devuelven solo identificación; duplicados con documento enmascarado | ✅ |
| Integridad de altas | Una historia por paciente; alta concurrente con el mismo documento → exactamente 1 paciente (restricción de BD) | ✅ |
| Atomicidad | Conversión lead→paciente todo-o-nada (probado con fallo tardío simulado) | ✅ + mutación |
| Sin borrado físico | Pacientes se archivan (`is_active`); no hay endpoint de borrado | ✅ |

**Limitaciones conocidas (Fase 2)**
- La **búsqueda/listado** no se audita fila por fila (solo la lectura individual): devuelve datos mínimos, pero un usuario con permiso podría enumerar pacientes. Mitigación posible: limitar ritmo y alertar patrones atípicos (Fase 7).
- El **documento de identidad no es editable** por API; corregirlo requerirá un flujo excepcional del OWNER con auditoría.
- El consentimiento de datos se registra con la fecha, pero aún no **quién** lo otorgó (en menores debería ser el apoderado) ni la versión del texto: llegará con la tabla `consents` (Fase 4).
- La relación terapéutica se asigna **a mano**; la automática al agendar llega en Fase 3.
- Normalización telefónica y formato de CE: **[VERIFICAR]** contra el plan de numeración y la norma migratoria.

## 10. Implementado en Fase 3 (estado real)
| Control | Implementación | Probado |
|---|---|---|
| Integridad de la agenda | 3 restricciones de exclusión en BD (doctor, sala, paciente) + comprobación previa con mensajes claros; 6 reservas simultáneas del mismo hueco → exactamente 1 gana | ✅ + inserción directa saltándose la API |
| Mínimo privilegio | El doctor solo ve y atiende sus citas; denegaciones auditadas | ✅ + mutación |
| Auditoría sin datos personales | Citas auditadas con `patient_id` y **solo códigos de estado** ("estado=CONFIRMED"); test que busca nombres, notas y motivos en toda la tabla | ✅ |
| Datos mínimos al conflicto | Un 409 de solapamiento devuelve solo horarios, **no** quién ocupa el hueco | ✅ |
| Sin datos clínicos en citas | `admin_notes` es solo logística (la UI avisa); no hay campos clínicos | — (revisión) |
| Series todo-o-nada | Si una sesión falla no se guarda ninguna; se listan todas las problemáticas | ✅ + mutación |
| Horario en hora local | Reglas en `America/Lima`; fechas sin zona horaria se rechazan (422) | ✅ |

**Limitaciones conocidas (Fase 3)**
- Las excepciones (vacaciones/feriados) **no cancelan** las citas ya programadas: devuelven cuántas quedan afectadas y recepción debe reprogramarlas.
- "Completar" una cita es manual por ahora; en la Fase 4 ocurrirá al **firmar** el encuentro clínico.
- El listado del calendario no se audita fila por fila (solo la lectura individual), igual que pacientes.
- No hay recordatorios automáticos (WhatsApp/email): solo una lista para contactar a mano.

## 11. Implementado en Fase 4 (estado real)
- **Auditoría clínica**: toda lectura y escritura (resumen, alergias, medicación, antecedentes, encuentros, consentimientos, firmas, adjuntos) registra actor, acción, recurso y `patient_id`. El motivo solo contiene códigos (`tipo=…`, `campos=…`), **nunca** texto clínico, nombres ni nombres de archivo (probado leyendo toda la tabla de auditoría).
- **Inmutabilidad en dos capas**: servicio (409 `encounter_not_editable`) y triggers de PostgreSQL (aunque alguien salte la API). Probado: UPDATE/DELETE directos sobre encuentros firmados, vitales, diagnósticos y adendas fallan.
- **Integridad**: `GET /encounters/{id}/integrity` recalcula el SHA-256 y lo compara con el guardado; se probó que detecta una alteración hecha desactivando el trigger. Es una **huella de integridad, no una firma digital con valor legal** **[VERIFICAR]** requisitos de firma digital/electrónica de HC en Perú.
- **Adjuntos**: lista blanca (PDF, PNG, JPEG, WEBP), verificación de los **bytes reales** (un ejecutable renombrado se rechaza), máx. 10 MB, nombre aleatorio en disco (el nombre original solo se muestra, saneado), descarga siempre como `attachment` con `nosniff` y `no-store`, las fotos exigen consentimiento. Si la fila existe pero el archivo no, el error es controlado (404 `attachment_file_missing`) y se registra para operaciones.
- **Consentimientos**: el verbal solo vale para atención general y fotos; menores firman con apoderado; la revocación bloquea la firma de nuevos encuentros; nunca se borran. **Textos de ejemplo, no legales.**
- **Bug de seguridad hallado por las pruebas**: `GET /consents/{id}/signature` exigía el permiso clínico pero **no** la relación terapéutica (cualquier doctor podía ver la firma de cualquier paciente). Corregido y cubierto por un test (verificado con mutación).
- **Pendiente**: retención de 20 años **[VERIFICAR]**, cifrado en reposo de adjuntos, antivirus, límites de tasa de subida, exportación PDF de la HC, y revisión legal de los textos de consentimiento.
