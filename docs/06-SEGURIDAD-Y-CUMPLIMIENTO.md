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
- Verificador `scripts/verify_audit_chain.py` detecta alteraciones.
- Se audita **lectura** de fichas, no solo escrituras.
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
