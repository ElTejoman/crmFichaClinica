import type { BadgeTone } from '@/shared/ui'
import type {
  AllergySeverity,
  AttachmentKind,
  ConditionKind,
  ConsentMethod,
  ConsentType,
  DiagnosisType,
  EncounterStatus,
  VitalContext,
} from '@/shared/types/aliases'

/** Etiquetas en español (Perú) de los valores clínicos del contrato. */
export const ENCOUNTER_STATUS_LABELS: Record<EncounterStatus, string> = {
  DRAFT: 'Borrador',
  SIGNED: 'Firmado',
  AMENDED: 'Enmendado',
}

/** El estado nunca depende solo del color: el Badge siempre lleva texto e icono. */
export const ENCOUNTER_STATUS_PRESENTATION: Record<
  EncounterStatus,
  { tone: BadgeTone; icon: string }
> = {
  DRAFT: { tone: 'warning', icon: '✎' },
  SIGNED: { tone: 'success', icon: '✓' },
  AMENDED: { tone: 'brand', icon: '＋' },
}

export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, string> = {
  MILD: 'Leve',
  MODERATE: 'Moderada',
  SEVERE: 'Grave',
}

export const ALL_ALLERGY_SEVERITIES: readonly AllergySeverity[] = ['MILD', 'MODERATE', 'SEVERE']

export const CONDITION_KIND_LABELS: Record<ConditionKind, string> = {
  PERSONAL: 'Personal',
  FAMILY: 'Familiar',
  SURGICAL: 'Quirúrgico',
  HABIT: 'Hábito',
}

export const ALL_CONDITION_KINDS: readonly ConditionKind[] = [
  'PERSONAL',
  'FAMILY',
  'SURGICAL',
  'HABIT',
]

export const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  DATA_PROCESSING: 'Tratamiento de datos personales',
  GENERAL_CARE: 'Atención general',
  ACUPUNCTURE_INVASIVE: 'Acupuntura invasiva',
  CHIROPRACTIC_MANIPULATION: 'Manipulación quiropráctica',
  IV_THERAPY: 'Sueroterapia',
  DENTAL_PROCEDURE: 'Procedimiento odontológico',
  PHOTO_USE: 'Uso de fotografías',
}

export const ALL_CONSENT_TYPES: readonly ConsentType[] = [
  'GENERAL_CARE',
  'DATA_PROCESSING',
  'ACUPUNCTURE_INVASIVE',
  'CHIROPRACTIC_MANIPULATION',
  'IV_THERAPY',
  'DENTAL_PROCEDURE',
  'PHOTO_USE',
]

export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = {
  ON_SCREEN: 'Firma en pantalla',
  PAPER_SCANNED: 'Documento escaneado',
  VERBAL_RECORDED: 'Verbal registrado',
}

export const ALL_CONSENT_METHODS: readonly ConsentMethod[] = [
  'ON_SCREEN',
  'PAPER_SCANNED',
  'VERBAL_RECORDED',
]

export const VITAL_CONTEXT_LABELS: Record<VitalContext, string> = {
  SINGLE: 'Medición única',
  PRE: 'Antes (PRE)',
  DURING: 'Durante',
  POST: 'Después (POST)',
}

/** Orden clínico de una serie, sea cual sea el orden en que llegue del servidor. */
export const VITAL_CONTEXT_ORDER: readonly VitalContext[] = ['SINGLE', 'PRE', 'DURING', 'POST']

export const DIAGNOSIS_TYPE_LABELS: Record<DiagnosisType, string> = {
  PRESUMPTIVE: 'Presuntivo',
  DEFINITIVE: 'Definitivo',
}

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  LAB: 'Laboratorio',
  IMAGING: 'Imagen diagnóstica',
  PHOTO: 'Fotografía',
  REPORT: 'Informe',
  CONSENT_SCAN: 'Consentimiento escaneado',
  OTHER: 'Otro',
}

export const ALL_ATTACHMENT_KINDS: readonly AttachmentKind[] = [
  'LAB',
  'IMAGING',
  'PHOTO',
  'REPORT',
  'CONSENT_SCAN',
  'OTHER',
]
