import { useEffect, useState } from 'react'

const REFRESH_MS = 60_000

/** "Ahora" que se refresca cada minuto: los indicadores de "vencida" no se quedan desfasados. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])
  return now
}
