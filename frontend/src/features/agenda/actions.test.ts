import type { AppointmentStatus, Role } from '@/shared/types/aliases'

import { availableActions } from './actions'

const DOCTOR_ID = 'd-1'
const reception = { id: 'r-1', roles: ['RECEPTION'] as Role[] }
const doctor = { id: DOCTOR_ID, roles: ['DOCTOR'] as Role[] }
const otherDoctor = { id: 'd-2', roles: ['DOCTOR'] as Role[] }
const ownerDoctor = { id: DOCTOR_ID, roles: ['OWNER', 'DOCTOR'] as Role[] }
const superuser = { id: 's-1', roles: ['SUPERUSER'] as Role[] }

function actionsFor(status: AppointmentStatus, viewer: typeof doctor) {
  return availableActions({ status, doctor_user_id: DOCTOR_ID }, viewer)
}

describe('availableActions (estado × rol)', () => {
  it('recepción: gestiona según el estado y nunca inicia/completa', () => {
    expect(actionsFor('SCHEDULED', reception)).toEqual([
      'confirm',
      'check-in',
      'reschedule',
      'no-show',
      'cancel',
    ])
    expect(actionsFor('CONFIRMED', reception)).toEqual([
      'check-in',
      'reschedule',
      'no-show',
      'cancel',
    ])
    expect(actionsFor('CHECKED_IN', reception)).toEqual(['cancel'])
    expect(actionsFor('IN_PROGRESS', reception)).toEqual([])
  })

  it('check-in solo desde Agendada o Confirmada (no desde una cita ya atendida o cancelada)', () => {
    for (const status of [
      'CHECKED_IN',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ] as const) {
      expect(actionsFor(status, reception)).not.toContain('check-in')
    }
  })

  it('los estados terminales no ofrecen nada a nadie', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const) {
      for (const viewer of [reception, doctor, ownerDoctor, superuser]) {
        expect(actionsFor(status, viewer)).toEqual([])
      }
    }
  })

  it('el doctor de la cita inicia (en espera) y completa (en atención), y no gestiona', () => {
    expect(actionsFor('CHECKED_IN', doctor)).toEqual(['start'])
    expect(actionsFor('IN_PROGRESS', doctor)).toEqual(['complete'])
    expect(actionsFor('SCHEDULED', doctor)).toEqual([])
    expect(actionsFor('CONFIRMED', doctor)).toEqual([])
  })

  it('otro doctor no puede atender una cita ajena', () => {
    expect(actionsFor('CHECKED_IN', otherDoctor)).toEqual([])
    expect(actionsFor('IN_PROGRESS', otherDoctor)).toEqual([])
  })

  it('dueño-doctor suma ambos conjuntos en su propia cita', () => {
    expect(actionsFor('CHECKED_IN', ownerDoctor)).toEqual(['start', 'cancel'])
    expect(actionsFor('SCHEDULED', ownerDoctor)).toContain('confirm')
  })

  it('el superusuario solo lee: no ve acciones', () => {
    expect(actionsFor('SCHEDULED', superuser)).toEqual([])
  })
})
