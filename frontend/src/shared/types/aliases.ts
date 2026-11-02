import type { components } from './api'

/** Alias legibles de los esquemas generados (api.d.ts es la única fuente del contrato). */
type Schemas = components['schemas']

export type Role = Schemas['Role']
export type Specialty = Schemas['Specialty']
export type ProfessionalBody = Schemas['ProfessionalBody']
export type UserRead = Schemas['UserRead']
export type UserCreate = Schemas['UserCreate']
export type UserUpdate = Schemas['UserUpdate']
export type AuditLogRead = Schemas['AuditLogRead']
export type ChainVerification = Schemas['ChainVerification']
export type TokenResponse = Schemas['TokenResponse']
