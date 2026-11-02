import { makeAppointment } from '@/test/appointments'

import {
  GRID_HEIGHT_PX,
  HOUR_HEIGHT_PX,
  layoutDay,
  MIN_BLOCK_HEIGHT_PX,
  nowOffsetPx,
  timeFromOffset,
} from './calendar'

const DAY = '2026-11-03'

describe('layoutDay', () => {
  it('09:00 de Lima (14:00Z) se dibuja 2 h debajo de las 07:00, no a las 14:00', () => {
    const { blocks } = layoutDay([makeAppointment()], DAY)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.topPx).toBe(2 * HOUR_HEIGHT_PX)
  })

  it('el alto es proporcional a la duración', () => {
    const sixty = makeAppointment({ ends_at: '2026-11-03T15:00:00Z' })
    const { blocks } = layoutDay([sixty], DAY)
    expect(blocks[0]?.heightPx).toBe(HOUR_HEIGHT_PX)
  })

  it('una cita muy corta no baja del alto mínimo legible', () => {
    const short = makeAppointment({ ends_at: '2026-11-03T14:05:00Z' })
    expect(layoutDay([short], DAY).blocks[0]?.heightPx).toBe(MIN_BLOCK_HEIGHT_PX)
  })

  it('solo dibuja las citas del día pedido (en Lima)', () => {
    // 02:00Z del día 4 = 21:00 del día 3 en Lima: cae fuera de la rejilla del día 3.
    const late = makeAppointment({
      id: 'late',
      starts_at: '2026-11-04T02:00:00Z',
      ends_at: '2026-11-04T02:30:00Z',
    })
    const other = makeAppointment({
      id: 'other',
      starts_at: '2026-11-04T14:00:00Z',
      ends_at: '2026-11-04T14:30:00Z',
    })
    const result = layoutDay([late, other], DAY)
    expect(result.blocks).toHaveLength(0)
    expect(result.outside.map((a) => a.id)).toEqual(['late'])
  })

  it('recorta lo que empieza antes de las 07:00 pero entra en la rejilla', () => {
    const early = makeAppointment({
      starts_at: '2026-11-03T11:30:00Z', // 06:30 Lima
      ends_at: '2026-11-03T12:30:00Z', // 07:30 Lima
    })
    const block = layoutDay([early], DAY).blocks[0]
    expect(block?.topPx).toBe(0)
    expect(block?.heightPx).toBe(HOUR_HEIGHT_PX / 2)
  })

  it('las citas solapadas van en columnas distintas; las separadas, cada una a ancho completo', () => {
    const a = makeAppointment({ id: 'a' })
    const b = makeAppointment({ id: 'b', doctor_user_id: 'd-2' })
    const c = makeAppointment({
      id: 'c',
      starts_at: '2026-11-03T15:00:00Z',
      ends_at: '2026-11-03T15:30:00Z',
    })
    const { blocks } = layoutDay([a, b, c], DAY)
    const byId = Object.fromEntries(blocks.map((x) => [x.appointment.id, x]))
    expect(byId.a?.laneCount).toBe(2)
    expect(byId.b?.laneCount).toBe(2)
    expect(new Set([byId.a?.lane, byId.b?.lane]).size).toBe(2)
    expect(byId.c?.laneCount).toBe(1)
    expect(byId.c?.lane).toBe(0)
  })
})

describe('timeFromOffset', () => {
  it('traduce un clic a la media hora anterior', () => {
    expect(timeFromOffset(0)).toBe('07:00')
    expect(timeFromOffset(2 * HOUR_HEIGHT_PX)).toBe('09:00')
    expect(timeFromOffset(2 * HOUR_HEIGHT_PX + 40)).toBe('09:30')
  })

  it('nunca propone una hora fuera de la rejilla', () => {
    expect(timeFromOffset(-50)).toBe('07:00')
    expect(timeFromOffset(GRID_HEIGHT_PX + 100)).toBe('19:30')
  })
})

describe('nowOffsetPx', () => {
  it('ubica la hora actual o devuelve null fuera de la jornada', () => {
    expect(nowOffsetPx(9 * 60)).toBe(2 * HOUR_HEIGHT_PX)
    expect(nowOffsetPx(6 * 60)).toBeNull()
    expect(nowOffsetPx(21 * 60)).toBeNull()
  })
})
