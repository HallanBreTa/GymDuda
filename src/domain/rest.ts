/** Descanso entre séries e durações em geral (exercícios de tempo). */
import type { Exercise } from '../types'

/** Usado quando o exercício não tem descanso definido (dados antigos, templates). */
export const DEFAULT_REST_SEC = 90
export const MAX_REST_SEC = 15 * 60

/** Descanso do exercício em segundos. 0 = sem cronômetro. */
export const restOf = (exercise: Pick<Exercise, 'restSec'>) => exercise.restSec ?? DEFAULT_REST_SEC

/** 90 → "1:30", 45 → "0:45", 600 → "10:00". */
export function formatClock(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Texto curto para listas: 90 → "1:30", 0 → "sem descanso". */
export const formatRest = (sec: number) => (sec === 0 ? 'sem descanso' : formatClock(sec))

/**
 * Lê o descanso vindo do JSON/IA. Aceita:
 *   90 · "90" · "90s" · "1:30" · "2min" · "2 min" · "1m30s" · "1min30" · "1,5 min"
 * Retorna segundos, ou null se não reconhecer.
 */
export function parseRest(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? clamp(value) : null
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase().replace(',', '.').replace(/\s+/g, '')
  if (!v) return null

  let m = v.match(/^(\d+):(\d{1,2})$/) // 1:30
  if (m) return clamp(Number(m[1]) * 60 + Number(m[2]))

  m = v.match(/^(\d+(?:\.\d+)?)(?:s|seg|segundos?)?$/) // 90 / 90s
  if (m) return clamp(Number(m[1]))

  m = v.match(/^(\d+(?:\.\d+)?)(?:m|min|minutos?)(?:(\d+)(?:s|seg|segundos?)?)?$/) // 2min / 1m30s / 1min30 / 1.5min
  if (m) return clamp(Number(m[1]) * 60 + Number(m[2] ?? 0))

  return null
}

/**
 * Entrada estilo micro-ondas para o teclado numérico (que não tem ":"):
 * os 2 últimos dígitos são os segundos. "45" → 45 · "130" → 90 · "200" → 120 · "90" → 90.
 */
export function digitsToSeconds(digits: string): number | null {
  const d = digits.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(-4)
  if (!d) return null
  const sec = Number(d.slice(-2))
  const min = Number(d.slice(0, -2) || 0)
  return min * 60 + sec
}

/** "45s", "1:00", "2min" — texto que claramente é um tempo (usado para inferir exercícios de tempo). */
export const looksLikeDuration = (text: string) => /\d\s*(s|seg|segundos?|min|minutos?)\b|^\d+:\d{2}$/i.test(text.trim())

const clamp = (sec: number) => Math.min(MAX_REST_SEC, Math.max(0, Math.round(sec)))
