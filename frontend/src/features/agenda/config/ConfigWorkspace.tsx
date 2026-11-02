import { useState } from 'react'

import { Tabs, type TabItem } from '@/shared/ui'

import { ExceptionsTab } from './ExceptionsTab'
import { RoomsTab } from './RoomsTab'
import { SchedulesTab } from './SchedulesTab'
import { TypesTab } from './TypesTab'

type ConfigTab = 'horarios' | 'excepciones' | 'salas' | 'tipos'

const TABS: readonly TabItem<ConfigTab>[] = [
  { id: 'horarios', label: 'Horarios' },
  { id: 'excepciones', label: 'Excepciones' },
  { id: 'salas', label: 'Salas' },
  { id: 'tipos', label: 'Tipos de cita' },
]

/** Configuración de la agenda: horarios, excepciones (vacaciones/feriados), salas y tipos de cita. */
export function ConfigWorkspace() {
  const [tab, setTab] = useState<ConfigTab>('horarios')
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-slate-900">Configuración de la agenda</h1>
      <Tabs label="Configuración de la agenda" tabs={TABS} value={tab} onChange={setTab}>
        {tab === 'horarios' && <SchedulesTab />}
        {tab === 'excepciones' && <ExceptionsTab />}
        {tab === 'salas' && <RoomsTab />}
        {tab === 'tipos' && <TypesTab />}
      </Tabs>
    </div>
  )
}
