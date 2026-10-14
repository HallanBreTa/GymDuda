import type { WorkoutColor } from './types'

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/* ---------- Datas (sempre no fuso local, chave = yyyy-mm-dd) ---------- */

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function parseISODate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Soma dias em uma data ISO. Usa o construtor de Date, então horário de verão não interfere. */
export function addDays(iso: string, n: number) {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Dia da semana com Segunda = 0. */
export const weekdayOf = (iso: string) => (parseISODate(iso).getDay() + 6) % 7

/** Segunda-feira da semana da data. */
export const startOfWeek = (iso: string) => addDays(iso, -weekdayOf(iso))

/** Diferença em dias (b - a). */
export const diffDays = (a: string, b: string) =>
  Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000)

export const todayISO = () => toISODate(new Date())

export const formatShortDate = (iso: string) =>
  parseISODate(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')

export const formatLongDate = (iso: string) =>
  parseISODate(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

/** "hoje", "ontem", "amanhã" ou o dia da semana. */
export function relativeDayLabel(iso: string, today: string) {
  const diff = diffDays(today, iso)
  if (diff === 0) return 'hoje'
  if (diff === -1) return 'ontem'
  if (diff === 1) return 'amanhã'
  return WEEKDAYS[weekdayOf(iso)].toLowerCase()
}

/* ---------- Visual ---------- */

/** Letra do treino: "Treino A - Peito" -> "A"; senão, primeira letra do nome. */
export function workoutBadge(name: string) {
  const m = name.match(/treino\s+([a-z0-9]{1,2})\b/i)
  return (m ? m[1] : name.trim().charAt(0) || '?').toUpperCase()
}

/** Classes Tailwind por cor (strings completas para o scanner do Tailwind). */
export const COLOR_STYLES: Record<
  WorkoutColor,
  { solid: string; soft: string; text: string; border: string; dot: string }
> = {
  lime: { solid: 'bg-lime text-on-accent', soft: 'bg-lime/12', text: 'text-accent', border: 'border-lime/40', dot: 'bg-lime' },
  sky: { solid: 'bg-sky-400 text-on-accent', soft: 'bg-sky-400/12', text: 'text-sky-400', border: 'border-sky-400/40', dot: 'bg-sky-400' },
  orange: { solid: 'bg-orange-400 text-on-accent', soft: 'bg-orange-400/12', text: 'text-orange-400', border: 'border-orange-400/40', dot: 'bg-orange-400' },
  pink: { solid: 'bg-pink-400 text-on-accent', soft: 'bg-pink-400/12', text: 'text-pink-400', border: 'border-pink-400/40', dot: 'bg-pink-400' },
  violet: { solid: 'bg-violet-400 text-on-accent', soft: 'bg-violet-400/12', text: 'text-violet-400', border: 'border-violet-400/40', dot: 'bg-violet-400' },
  teal: { solid: 'bg-teal-400 text-on-accent', soft: 'bg-teal-400/12', text: 'text-teal-400', border: 'border-teal-400/40', dot: 'bg-teal-400' },
}
