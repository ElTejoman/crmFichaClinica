import { ApiStatus } from '@/features/system-status'

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold text-brand-700">CRM Clínica</h1>
      <p className="text-slate-600">
        Gestión de pacientes, agenda y fichas clínicas. Acupuntura · Nutrición · Quiropraxia ·
        Sueroterapia · Odontología.
      </p>
      <ApiStatus />
    </main>
  )
}
