import { formatDayLong, formatTimeLima, limaDateKeyOf } from '@/shared/lib/dates'
import type { AppointmentRead } from '@/shared/types/aliases'

/** Nombre de pila para saludar (el nombre completo viene como "Nombres Apellidos"). */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

/**
 * Texto del recordatorio manual. Va por WhatsApp, un canal fuera de nuestro control: solo lleva
 * lo mínimo (nombre de pila, día, hora y doctor). NUNCA especialidad, tipo de cita, motivo ni
 * notas, que podrían revelar datos de salud (Ley 29733: dato sensible).
 */
export function buildReminderMessage(
  appointment: Pick<AppointmentRead, 'patient_name' | 'starts_at' | 'doctor_name'>,
): string {
  const day = formatDayLong(limaDateKeyOf(appointment.starts_at))
  const time = formatTimeLima(appointment.starts_at)
  return (
    `Hola ${firstName(appointment.patient_name)}, le recordamos su cita del ${day} a las ${time} ` +
    `con ${appointment.doctor_name}. Por favor responda a este mensaje para confirmar su asistencia.`
  )
}

/** Solo dígitos, como exige wa.me (sin "+" ni espacios). */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** Enlace `wa.me` con el mensaje ya codificado; null si no hay un teléfono utilizable. */
export function buildWhatsAppUrl(phone: string | null, message: string): string | null {
  if (!phone) return null
  const digits = phoneDigits(phone)
  if (digits.length === 0) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
