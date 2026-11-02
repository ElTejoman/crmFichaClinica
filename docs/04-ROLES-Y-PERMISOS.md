# 04 · Roles y permisos

## 1. Roles
| Rol | Descripción | Notas |
|---|---|---|
| `SUPERUSER` | Administración técnica: usuarios, configuración, catálogos, logs | **No** lee contenido clínico por defecto (principio de mínimo privilegio); si lo necesita usa *break-glass* auditado. |
| `OWNER` | Dueño de la clínica. Tableros, finanzas (fase 2), personal, auditoría | Además posee `DOCTOR` para su especialidad (múltiples roles por usuario). |
| `DOCTOR` | Profesional de una o más especialidades | Acceso clínico a pacientes con relación terapéutica. |
| `RECEPTION` | Agenda, admisión, datos administrativos, CRM | **Sin** acceso a contenido clínico. |
| `PATIENT` | Portal: sus citas, resumen, documentos, solicitudes ARCO | Solo su propia información. |
| *(Lead)* | **No es usuario**: entidad CRM | No inicia sesión; al convertirse pasa a `Patient`. |

## 2. Matriz (R=leer, C=crear, U=editar, D=desactivar, S=firmar, X=exportar, — = sin acceso)

| Recurso | SUPER | OWNER | DOCTOR | RECEPTION | PATIENT |
|---|---|---|---|---|---|
| Usuarios y roles | CRUD | R + invitar | — | — | — |
| Catálogos/config | CRUD | R | R | R | — |
| Leads (CRM) | R | CRUD + reportes | R (los suyos) | CRUD | — |
| Pacientes (datos administrativos) | R | CRUD | R (su cartera) | CRUD | R/U propio (limitado) |
| Agenda / citas | R | CRUD | R/U (las suyas) | CRUD | R propias; solicita/cancela |
| **HC: resumen (alergias, alertas)** | break-glass | R | R/U (su cartera) | — | R |
| **Encuentros de su especialidad** | break-glass | R todas + C/S si doctor | CRUS | — | R (los firmados, según política) |
| **Encuentros de otra especialidad** | break-glass | R | R solo con relación terapéutica o permiso del paciente | — | R |
| Adjuntos clínicos | — | R | CRU | — | R propios |
| Consentimientos | — | R | C (capturar) | C (capturar firma en admisión) | R + revocar |
| Auditoría | R | R | R (sus propios accesos) | — | R (accesos a su HC) |
| Exportar HC (PDF) | — | X | X (su cartera) | — | X propia |

## 3. Reglas de autorización (se evalúan en `domain/policies`)
1. **RBAC**: ¿el rol permite la acción sobre el recurso?
2. **Alcance por especialidad**: un doctor escribe solo en encuentros de **sus** especialidades.
3. **Relación terapéutica** (`care_team`): se crea al agendar/atender; permite leer la ficha. Sin relación → denegado, salvo permiso del paciente o *break-glass*.
4. **Información sensible marcada por el paciente** (RENHICE): requiere permiso explícito aun con relación.
5. **Break-glass**: motivo obligatorio, 30 min, alerta al `OWNER`, revisión posterior.
6. **Inmutabilidad**: un encuentro `SIGNED` solo admite adenda del mismo autor (u `OWNER` con motivo).
7. **Autoservicio**: `PATIENT` accede únicamente a `patient_id == su vínculo`.

## 4. Autenticación y sesión
- Email + contraseña (Argon2id, política de complejidad, bloqueo progresivo por intentos).
- Access JWT 15 min; refresh 7 días rotativo en cookie `httpOnly; Secure; SameSite=Strict`.
- 2FA TOTP **obligatorio** para `SUPERUSER`, `OWNER`, `DOCTOR` (fase de hardening; en dev desactivable por variable).
- Cierre de sesión por inactividad (15 min en vistas clínicas).
- Cada decisión de autorización denegada se audita.
