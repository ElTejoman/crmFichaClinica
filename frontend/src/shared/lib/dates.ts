/** La clínica opera en Lima; la BD guarda UTC (decisión del proyecto), por eso se convierte al mostrar. */
export const CLINIC_TIME_ZONE = 'America/Lima'

const formatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: CLINIC_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'medium',
})

const HAS_TIME_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i

/** Formatea un instante ISO en hora de Lima. Un ISO sin zona se interpreta como UTC (así lo guarda el servidor). */
export function formatDateTimeLima(iso: string): string {
  const date = new Date(HAS_TIME_ZONE.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(date.getTime()) ? iso : formatter.format(date)
}
