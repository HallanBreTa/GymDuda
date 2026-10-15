/**
 * Som e vibração do app (fim do descanso, série incompleta…), com a preferência do usuário.
 * A preferência é por aparelho (localStorage), como o tema — não vai para a nuvem.
 */
import { useCallback, useState } from 'react'

export type FeedbackPrefs = { sound: boolean; vibration: boolean }

const STORAGE_KEY = 'gymduda:feedback'
const DEFAULTS: FeedbackPrefs = { sound: true, vibration: true }

/** Cópia em memória: vale mesmo se o localStorage falhar (modo privado). */
let current: FeedbackPrefs | null = null

export function readFeedbackPrefs(): FeedbackPrefs {
  if (current) return current
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<FeedbackPrefs> | null
    return { sound: v?.sound ?? DEFAULTS.sound, vibration: v?.vibration ?? DEFAULTS.vibration }
  } catch {
    return DEFAULTS
  }
}

/** iPhone (Safari) não tem API de vibração. */
export const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator

/** Vibra, se o usuário não desligou. */
export function vibrate(pattern: number | number[]) {
  if (readFeedbackPrefs().vibration && canVibrate()) navigator.vibrate(pattern)
}

/* ---------- Som (Web Audio: sem arquivo, funciona offline) ---------- */

let audioCtx: AudioContext | null = null

/** Precisa ser chamado num toque do usuário — navegadores só liberam áudio após um gesto. */
export function unlockAudio() {
  if (!readFeedbackPrefs().sound) return
  try {
    audioCtx ??= new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
  } catch {
    audioCtx = null
  }
}

/** Três bipes curtos (fim do descanso), se o usuário não desligou o som. */
export function beep() {
  if (!readFeedbackPrefs().sound || !audioCtx) return
  const ctx = audioCtx
  const t0 = ctx.currentTime
  ;[0, 0.22, 0.44].forEach((offset, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = i === 2 ? 1320 : 880
    gain.gain.setValueAtTime(0.0001, t0 + offset)
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0 + offset)
    osc.stop(t0 + offset + 0.2)
  })
}

/** Alerta de fim de descanso (usado também pelo botão "Testar" dos Ajustes). */
export function restFinishedAlert() {
  vibrate([250, 120, 250, 120, 450])
  beep()
}

export function useFeedbackPrefs() {
  const [prefs, setPrefs] = useState(readFeedbackPrefs)

  const update = useCallback((patch: Partial<FeedbackPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch }
      current = next
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // modo privado: vale só nesta sessão
      }
      return next
    })
  }, [])

  return [prefs, update] as const
}
