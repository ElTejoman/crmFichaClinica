import { createBrowserRouter } from 'react-router-dom'

import { HomePage } from '@/pages/HomePage'

// Fase 1 añadirá /login y rutas protegidas por rol (RoleGuard).
export const router = createBrowserRouter([{ path: '/', element: <HomePage /> }])
