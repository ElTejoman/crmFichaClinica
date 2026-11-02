import { useContext } from 'react'

import { AuthContext, type AuthContextValue } from './authContext'

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return value
}
