import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { restFinishedAlert, unlockAudio } from '../feedback'

/**
 * Cronômetro de descanso entre séries.
 *
 * Guarda o horário de término (`endAt`), não um contador: continua certo se o app for
 * para segundo plano, a tela bloquear ou a página recarregar (fica salvo no localStorage).
 */
export type RestTimer = {
  /** `${data}:${exerciseId}:${índice da série}` — permite cancelar ao desfazer a série. */
  id: string
  exerciseName: string
  setLabel: string
  totalSec: number
  endAt: number
}

const STORAGE_KEY = 'gymduda:rest-timer'
/** Por quanto tempo o aviso "descanso concluído" fica na tela. */
const DONE_BANNER_MS = 6000

function loadTimer(): RestTimer | null {
  try {
    const t = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as RestTimer | null
    // Terminou há mais de 1 min (ex.: app fechado): não faz sentido mostrar.
    return t && typeof t.endAt === 'number' && t.endAt > Date.now() - 60_000 ? t : null
  } catch {
    return null
  }
}

/* ---------- Hook ---------- */

export function useRestTimer() {
  const [timer, setTimer] = useState<RestTimer | null>(loadTimer)
  const [now, setNow] = useState(() => Date.now())
  const alertedFor = useRef<string | null>(null)

  useEffect(() => {
    try {
      if (timer) localStorage.setItem(STORAGE_KEY, JSON.stringify(timer))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // sem localStorage: o cronômetro funciona só em memória
    }
  }, [timer])

  // Tique enquanto houver cronômetro (inclui o período do aviso de concluído).
  useEffect(() => {
    if (!timer) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [timer])

  const remainingMs = timer ? timer.endAt - now : 0
  const finished = !!timer && remainingMs <= 0

  // Fim do descanso: vibra + bipa uma vez; some sozinho depois de alguns segundos.
  useEffect(() => {
    if (!timer || !finished) return
    if (alertedFor.current !== `${timer.id}@${timer.endAt}`) {
      alertedFor.current = `${timer.id}@${timer.endAt}`
      if (Date.now() - timer.endAt < 5000) restFinishedAlert() // respeita som/vibração dos Ajustes
    }
    const t = window.setTimeout(() => setTimer((cur) => (cur === timer ? null : cur)), Math.max(0, timer.endAt + DONE_BANNER_MS - Date.now()))
    return () => window.clearTimeout(t)
  }, [timer, finished])

  const start = useCallback((t: Omit<RestTimer, 'endAt'>) => {
    unlockAudio()
    const at = Date.now()
    setNow(at)
    setTimer({ ...t, endAt: at + t.totalSec * 1000 })
  }, [])

  /** ±segundos. Não deixa o restante ficar negativo. */
  const adjust = useCallback((deltaSec: number) => {
    setTimer((t) => {
      if (!t) return t
      const endAt = Math.max(Date.now(), t.endAt + deltaSec * 1000)
      return { ...t, endAt, totalSec: Math.max(1, t.totalSec + deltaSec) }
    })
  }, [])

  const skip = useCallback(() => setTimer(null), [])
  const cancel = useCallback((id: string) => setTimer((t) => (t?.id === id ? null : t)), [])

  return useMemo(
    () => ({ timer, remainingSec: Math.max(0, Math.ceil(remainingMs / 1000)), finished, start, adjust, skip, cancel }),
    [timer, remainingMs, finished, start, adjust, skip, cancel],
  )
}

export type RestTimerControls = ReturnType<typeof useRestTimer>
