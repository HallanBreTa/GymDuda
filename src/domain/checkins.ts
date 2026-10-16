/** Check-in diário (disposição e dor na coluna) e resumo da semana para a aba Início. */
import { Annoyed, Frown, Laugh, Meh, Smile } from 'lucide-react'
import type { CheckIn, GymState, Mood } from '../types'
import { addDays, startOfWeek } from '../utils'
import { projectDays, type DayPlan } from './queue'

export const MOODS: { value: Mood; label: string; icon: typeof Smile }[] = [
  { value: 1, label: 'Péssimo', icon: Frown },
  { value: 2, label: 'Mal', icon: Annoyed },
  { value: 3, label: 'Ok', icon: Meh },
  { value: 4, label: 'Bem', icon: Smile },
  { value: 5, label: 'Ótimo', icon: Laugh },
]

export const moodMeta = (mood: Mood) => MOODS[mood - 1]

export const isMood = (v: unknown): v is Mood => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
export const isPain = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10

export function painLabel(n: number) {
  if (n === 0) return 'sem dor'
  if (n <= 3) return 'leve'
  if (n <= 6) return 'moderada'
  return 'forte'
}

/** Classes de cor da dor: fundo forte (selecionado), fundo suave e texto. */
export function painTone(n: number): { solid: string; soft: string; text: string } {
  if (n <= 2) return { solid: 'bg-lime text-on-accent', soft: 'bg-lime/12', text: 'text-accent' }
  if (n <= 5) return { solid: 'bg-amber-400 text-on-accent', soft: 'bg-amber-400/12', text: 'text-amber-400' }
  if (n <= 7) return { solid: 'bg-orange-400 text-on-accent', soft: 'bg-orange-400/12', text: 'text-orange-400' }
  return { solid: 'bg-red-500 text-white', soft: 'bg-red-500/12', text: 'text-red-400' }
}

export const isEmptyCheckin = (c: Pick<CheckIn, 'mood' | 'backPain' | 'note'>) => c.mood === null && c.backPain === null && !c.note.trim()

/** Mescla um check-in; devolve null quando ficou vazio (a entrada é apagada). */
export function mergeCheckin(current: CheckIn | undefined, patch: Partial<Omit<CheckIn, 'updatedAt'>>, now = Date.now()): CheckIn | null {
  const next: CheckIn = { mood: null, backPain: null, note: '', ...current, ...patch, updatedAt: now }
  return isEmptyCheckin(next) ? null : next
}

/** Valida check-ins vindos do armazenamento/nuvem, descartando os inválidos. */
export function sanitizeCheckins(raw: unknown): Record<string, CheckIn> {
  const out: Record<string, CheckIn> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [date, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !v || typeof v !== 'object') continue
    const c = v as Record<string, unknown>
    const checkin: CheckIn = {
      mood: isMood(c.mood) ? c.mood : null,
      backPain: isPain(c.backPain) ? c.backPain : null,
      note: typeof c.note === 'string' ? c.note : '',
      updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : 0,
    }
    if (!isEmptyCheckin(checkin)) out[date] = checkin
  }
  return out
}

export type WeekProgress = {
  weekStart: string
  dates: string[]
  plans: Record<string, DayPlan>
  /** Dias da semana com treino concluído. */
  done: number
}

export function weekProgress(state: GymState, today: string): WeekProgress {
  const weekStart = startOfWeek(today)
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const plans = projectDays(state, dates, today)
  const done = dates.filter((d) => plans[d].kind === 'done').length
  return { weekStart, dates, plans, done }
}

/** Média de um conjunto de números (null se vazio). */
export const average = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null)

/** Valores de disposição ou dor registrados nos `days` dias terminando em `end` (inclusive). */
export function checkinValues(state: GymState, field: 'mood' | 'backPain', end: string, days: number): number[] {
  const out: number[] = []
  for (let i = days - 1; i >= 0; i--) {
    const v = state.checkins?.[addDays(end, -i)]?.[field]
    if (v !== null && v !== undefined) out.push(v)
  }
  return out
}

/** Linha do export: "Disposição 4/5 (Bem), dor na coluna 3/10 (leve) — obs: …". */
export function checkinLine(c: CheckIn) {
  const parts = [
    c.mood !== null && `disposição ${c.mood}/5 (${moodMeta(c.mood).label})`,
    c.backPain !== null && `dor na coluna ${c.backPain}/10 (${painLabel(c.backPain)})`,
  ].filter(Boolean)
  const note = c.note.trim() ? ` — obs: ${c.note.trim()}` : ''
  return `- Check-in: ${parts.join(', ') || 'só observação'}${note}`
}
