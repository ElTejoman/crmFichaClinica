import type {
  AppointmentStatus,
  DocumentType,
  LeadActivityType,
  LeadSource,
  LeadStatus,
  MaritalStatus,
  ProfessionalBody,
  Role,
  Sex,
  Specialty,
} from '@/shared/types/aliases'

/** Etiquetas en español (Perú) para los valores del contrato. El código usa los valores en inglés. */
export const ROLE_LABELS: Record<Role, string> = {
  SUPERUSER: 'Superusuario',
  OWNER: 'Dueño',
  DOCTOR: 'Doctor/a',
  RECEPTION: 'Recepción',
  PATIENT: 'Paciente',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPERUSER: 'Administración técnica: usuarios, configuración y auditoría.',
  OWNER: 'Gestión de la clínica: personal, tableros y auditoría.',
  DOCTOR: 'Atención clínica de las especialidades asignadas.',
  RECEPTION: 'Agenda, admisión y datos administrativos.',
  PATIENT: 'Portal del paciente: citas y documentos propios.',
}

export const ALL_ROLES: readonly Role[] = ['SUPERUSER', 'OWNER', 'DOCTOR', 'RECEPTION', 'PATIENT']

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  ACUPUNCTURE: 'Acupuntura',
  NUTRITION: 'Nutrición',
  CHIROPRACTIC: 'Quiropraxia',
  IV_THERAPY: 'Sueroterapia',
  DENTISTRY: 'Odontología',
}

export const ALL_SPECIALTIES: readonly Specialty[] = [
  'ACUPUNCTURE',
  'NUTRITION',
  'CHIROPRACTIC',
  'IV_THERAPY',
  'DENTISTRY',
]

export const PROFESSIONAL_BODY_LABELS: Record<ProfessionalBody, string> = {
  CMP: 'CMP · Colegio Médico del Perú',
  COP: 'COP · Colegio Odontológico del Perú',
  CNP: 'CNP · Colegio de Nutricionistas del Perú',
  OTHER: 'Otro',
}

export const ALL_PROFESSIONAL_BODIES: readonly ProfessionalBody[] = ['CMP', 'COP', 'CNP', 'OTHER']

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  DNI: 'DNI',
  CE: 'Carné de extranjería',
  PASSPORT: 'Pasaporte',
  OTHER: 'Otro documento',
}

export const ALL_DOCUMENT_TYPES: readonly DocumentType[] = ['DNI', 'CE', 'PASSPORT', 'OTHER']

export const SEX_LABELS: Record<Sex, string> = {
  FEMALE: 'Femenino',
  MALE: 'Masculino',
  OTHER: 'Otro',
}

export const ALL_SEXES: readonly Sex[] = ['FEMALE', 'MALE', 'OTHER']

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  SINGLE: 'Soltero/a',
  MARRIED: 'Casado/a',
  COHABITING: 'Conviviente',
  DIVORCED: 'Divorciado/a',
  WIDOWED: 'Viudo/a',
}

export const ALL_MARITAL_STATUSES: readonly MaritalStatus[] = [
  'SINGLE',
  'MARRIED',
  'COHABITING',
  'DIVORCED',
  'WIDOWED',
]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEB: 'Página web',
  REFERRAL: 'Referido',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  WALK_IN: 'Visita directa',
  OTHER: 'Otra',
}

export const ALL_LEAD_SOURCES: readonly LeadSource[] = [
  'WEB',
  'REFERRAL',
  'INSTAGRAM',
  'FACEBOOK',
  'WALK_IN',
  'OTHER',
]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  QUALIFIED: 'Calificado',
  APPOINTMENT_SET: 'Cita agendada',
  CONVERTED: 'Convertido',
  LOST: 'Perdido',
}

export const ACTIVITY_TYPE_LABELS: Record<LeadActivityType, string> = {
  CALL: 'Llamada',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Correo',
  NOTE: 'Nota',
  STATUS_CHANGE: 'Cambio de estado',
}

/** Tipos que el usuario puede registrar a mano (STATUS_CHANGE lo genera el servidor). */
export const REGISTRABLE_ACTIVITY_TYPES: readonly LeadActivityType[] = [
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'NOTE',
]

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'En espera (llegó)',
  IN_PROGRESS: 'En atención',
  COMPLETED: 'Atendida',
  NO_SHOW: 'No asistió',
  CANCELLED: 'Cancelada',
}

export const ALL_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
]

/** 0 = lunes … 6 = domingo, igual que `weekday` del API de horarios. */
export const WEEKDAY_LABELS: readonly string[] = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
]

export const WEEKDAY_SHORT_LABELS: readonly string[] = [
  'lun',
  'mar',
  'mié',
  'jue',
  'vie',
  'sáb',
  'dom',
]

export const MONTH_LABELS: readonly string[] = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Nombres de campos del API para mensajes de validación (422 estándar de FastAPI). */
export const FIELD_LABELS: Record<string, string> = {
  email: 'Correo',
  password: 'Contraseña',
  full_name: 'Nombre completo',
  phone: 'Teléfono',
  roles: 'Roles',
  doctor_profile: 'Perfil de doctor',
  license_number: 'N.º de colegiatura',
  professional_body: 'Colegio profesional',
  rne: 'RNE',
  specialties: 'Especialidades',
  limit: 'Límite',
  offset: 'Desplazamiento',
  document_number: 'Documento',
  first_name: 'Nombres',
  last_name: 'Apellidos',
  birth_date: 'Fecha de nacimiento',
  guardian: 'Apoderado',
  emergency_contact: 'Contacto de emergencia',
  patient: 'Paciente',
  interest_specialties: 'Especialidades de interés',
  lost_reason: 'Motivo de pérdida',
  next_action_at: 'Próxima acción',
  starts_at: 'Fecha y hora',
  duration_minutes: 'Duración',
  appointment_type_id: 'Tipo de cita',
  room_id: 'Sala',
  admin_notes: 'Notas administrativas',
  reason: 'Motivo',
  count: 'Cantidad de sesiones',
  interval_days: 'Días entre sesiones',
  name: 'Nombre',
  weekday: 'Día de la semana',
  start_time: 'Hora de inicio',
  end_time: 'Hora de fin',
  slot_minutes: 'Minutos por cita',
  valid_from: 'Vigente desde',
  valid_to: 'Vigente hasta',
  start_date: 'Fecha de inicio',
  end_date: 'Fecha de fin',
  from_date: 'Desde',
  to_date: 'Hasta',
}

/** Etiqueta de un rol; si el servidor añadiera uno nuevo se muestra tal cual en vez de fallar. */
export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role
}
