import { useEffect, useState } from 'react'
import { todayISO } from '../utils'

/**
 * Data de hoje (ISO) que se atualiza sozinha na virada da meia-noite
 * e quando o app volta do segundo plano (comum no celular).
 */
export function useToday() {
  const [today, setToday] = useState(todayISO)

  useEffect(() => {
    const refresh = () => setToday(todayISO())
    const interval = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
