/**
 * Access token SOLO en memoria. Nunca en localStorage/sessionStorage: ante un XSS no estaría al
 * alcance del script. La continuidad entre recargas la da la cookie httpOnly del refresh token.
 */
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}
