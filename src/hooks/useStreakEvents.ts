import { useCallback, useEffect, useRef } from 'react'
import { streakEventText, type StreakResult } from '../domain/streak'

/** Tempo depois de uma ação do usuário em que uma mudança na sequência vira comemoração. */
const ARM_MS = 2000

/**
 * Comemora (via `onEvent`) só mudanças causadas por uma ação do usuário: abrir o app, virar o dia
 * ou receber dados da nuvem não disparam nada. Devolve `arm()`, para chamar antes da ação.
 */
export function useStreakEvents(streak: StreakResult, onEvent: (text: string) => void) {
  const prev = useRef(streak)
  const armedUntil = useRef(0)

  useEffect(() => {
    const before = prev.current
    prev.current = streak
    if (Date.now() > armedUntil.current) return
    const text = streakEventText(before, streak)
    if (!text) return
    armedUntil.current = 0
    onEvent(text)
  }, [streak, onEvent])

  return useCallback(() => {
    armedUntil.current = Date.now() + ARM_MS
  }, [])
}
