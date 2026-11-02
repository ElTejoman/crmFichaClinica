import type { ProfessionalBody, Role, Specialty } from '@/shared/types/aliases'

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
}

/** Etiqueta de un rol; si el servidor añadiera uno nuevo se muestra tal cual en vez de fallar. */
export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role
}
