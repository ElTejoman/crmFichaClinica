import { screen } from '@testing-library/react'

import { installFetch, jsonResponse } from '@/test/fetchMock'
import { makeUser, renderWithAuth } from '@/test/renderWithAuth'

import { LeadStatsPanel } from './LeadStatsPanel'

afterEach(() => vi.unstubAllGlobals())

describe('LeadStatsPanel', () => {
  it('muestra totales, tasa de conversión y desgloses con valores en texto', async () => {
    installFetch(() =>
      jsonResponse(200, {
        total: 10,
        open: 6,
        converted: 2,
        lost: 2,
        conversion_rate: 0.2,
        by_status: { NEW: 4, CONTACTED: 2, CONVERTED: 2, LOST: 2 },
        by_source: { INSTAGRAM: 6, WALK_IN: 4 },
        by_specialty: { NUTRITION: 5 },
        lost_reasons: { Precio: 2 },
      }),
    )
    renderWithAuth(<LeadStatsPanel />, makeUser(['OWNER']))
    expect(await screen.findByText('20.0 %')).toBeInTheDocument()
    expect(screen.getByText('Instagram')).toBeInTheDocument()
    expect(screen.getByText('6 · 60%')).toBeInTheDocument()
    expect(screen.getByText('Precio')).toBeInTheDocument()
    expect(screen.getByText('2 · 100%')).toBeInTheDocument()
  })

  it('si no es dueño el servidor responde 403 y se muestra el mensaje', async () => {
    installFetch(() =>
      jsonResponse(403, { error: { code: 'permission_denied', message: 'Permiso denegado' } }),
    )
    renderWithAuth(<LeadStatsPanel />, makeUser(['RECEPTION']))
    expect(await screen.findByText('Permiso denegado')).toBeInTheDocument()
  })
})
