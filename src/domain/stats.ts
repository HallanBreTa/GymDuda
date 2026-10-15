/** Estatísticas para a aba Dados. Usa a mesma projeção da fila, então "falta" bate com a aba Semana. */
import { CARDIO_TYPES } from '../data/activityTypes'
import type { ActivityType, GymState, SetLog, WorkoutSession } from '../types'
import { addDays, diffDays, parseISODate, startOfWeek, weekdayOf } from '../utils'
import { projectDays } from './queue'
import { kindOf, parseDecimal, sessionStats } from './sets'

export type WeekdayStat = {
  /** Treinos concluídos nesse dia da semana (inclui extras). */
  done: number
  missed: number
  /** Ocorrências desse dia como dia de treino no período (já passadas). */
  planned: number
  /** Dias de treino planejados em que o treino foi feito. */
  attended: number
}

export type Bucket = {
  start: string
  label: string
  sessions: number
  volume: number
  activityMin: number
  cardioMin: number
  /** Dias em que o treino foi trocado por uma atividade avulsa. */
  replaced: number
  current: boolean
}

export type ProgressPoint = { date: string; set: SetLog; load: number; e1rm: number }

export type Stats = {
  from: string
  days: number
  sessions: number
  sets: number
  volume: number
  planned: number
  attended: number
  missed: number
  extras: number
  activityMin: number
  /** Cardio (CARDIO_TYPES): tempo, sessões e distância, extras e substituições somados. */
  cardio: { minutes: number; count: number; km: number }
  /** Treinos trocados por atividade avulsa ("no lugar do treino"). */
  replaced: { count: number; byCardio: number; minutes: number }
  weekdays: WeekdayStat[]
  bucketUnit: 'week' | 'month'
  buckets: Bucket[]
  plannedPerWeek: number
  byWorkout: { name: string; count: number }[]
  byActivity: { type: ActivityType; minutes: number; count: number }[]
  exercises: { name: string; points: ProgressPoint[] }[]
}

/** 1RM estimado (Epley), contando as repetições na reserva como possíveis. */
export function estimated1RM(set: SetLog) {
  const load = parseDecimal(set.load)
  const reps = parseDecimal(set.reps)
  if (!load || !reps) return 0
  return load * (1 + (reps + (parseDecimal(set.rir) ?? 0)) / 30)
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MAX_WEEKS = 26

function bucketsFor(from: string, today: string): { unit: 'week' | 'month'; starts: string[] } {
  const firstWeek = startOfWeek(from)
  const weeks = Math.floor(diffDays(firstWeek, startOfWeek(today)) / 7) + 1
  if (weeks <= MAX_WEEKS) return { unit: 'week', starts: Array.from({ length: weeks }, (_, i) => addDays(firstWeek, i * 7)) }
  const starts: string[] = []
  const d = parseISODate(from)
  d.setDate(1)
  const end = today.slice(0, 7)
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    starts.push(`${key}-01`)
    if (key >= end) break
    d.setMonth(d.getMonth() + 1)
  }
  return { unit: 'month', starts }
}

const bucketLabel = (start: string, unit: 'week' | 'month') => {
  const d = parseISODate(start)
  return unit === 'week' ? `${d.getDate()}/${d.getMonth() + 1}` : MONTHS[d.getMonth()]
}

/** Primeiro dia com dados (ou o início do uso da fila). */
export function firstDataDate(state: GymState, today: string) {
  const dates = [state.startDate, ...Object.keys(state.history), ...Object.keys(state.activities)].filter((d) => d <= today)
  return dates.sort()[0] ?? today
}

export function computeStats(state: GymState, from: string, today: string): Stats {
  const days = diffDays(from, today) + 1
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i))
  const plans = projectDays(state, dates, today)

  const weekdays: WeekdayStat[] = Array.from({ length: 7 }, () => ({ done: 0, missed: 0, planned: 0, attended: 0 }))
  const { unit, starts } = bucketsFor(from, today)
  const currentStart = unit === 'week' ? startOfWeek(today) : `${today.slice(0, 7)}-01`
  const buckets: Bucket[] = starts.map((start) => ({
    start,
    label: bucketLabel(start, unit),
    sessions: 0,
    volume: 0,
    activityMin: 0,
    cardioMin: 0,
    replaced: 0,
    current: start === currentStart,
  }))
  const bucketOf = (date: string) => {
    const key = unit === 'week' ? startOfWeek(date) : `${date.slice(0, 7)}-01`
    return buckets.find((b) => b.start === key)
  }

  const byWorkout = new Map<string, number>()
  const byActivity = new Map<ActivityType, { minutes: number; count: number }>()
  const exercises = new Map<string, { name: string; points: ProgressPoint[] }>()
  let sessions = 0
  let sets = 0
  let volume = 0
  let extras = 0
  let activityMin = 0
  const cardio = { minutes: 0, count: 0, km: 0 }
  const replaced = { count: 0, byCardio: 0, minutes: 0 }

  for (const date of dates) {
    const plan = plans[date]
    const wd = weekdays[weekdayOf(date)]
    const trainingDay = state.trainingDays[weekdayOf(date)]
    const bucket = bucketOf(date)

    // Hoje só conta se já tiver um resultado (feito/descanso/substituído).
    const past = date < today || plan.kind === 'done' || plan.kind === 'rest_logged' || plan.kind === 'replaced'
    if (trainingDay && past && plan.kind !== 'before_start') {
      wd.planned++
      if (plan.kind === 'done') wd.attended++
    }
    if (plan.kind === 'missed') wd.missed++

    for (const a of state.activities[date] ?? []) {
      activityMin += a.durationMin
      if (bucket) bucket.activityMin += a.durationMin
      const entry = byActivity.get(a.type) ?? { minutes: 0, count: 0 }
      entry.minutes += a.durationMin
      entry.count++
      byActivity.set(a.type, entry)
      const isCardio = CARDIO_TYPES.has(a.type)
      if (isCardio) {
        cardio.minutes += a.durationMin
        cardio.count++
        cardio.km += a.distanceKm ?? 0
        if (bucket) bucket.cardioMin += a.durationMin
      }
      if (a.mode === 'replace') {
        replaced.count++
        replaced.minutes += a.durationMin
        if (isCardio) replaced.byCardio++
        if (bucket) bucket.replaced++
      }
    }

    if (plan.kind !== 'done') continue
    const session: WorkoutSession = plan.session
    const st = sessionStats(session)
    sessions++
    sets += st.sets
    volume += st.volume
    if (session.extra) extras++
    wd.done++
    if (bucket) {
      bucket.sessions++
      bucket.volume += st.volume
    }
    byWorkout.set(session.workoutName, (byWorkout.get(session.workoutName) ?? 0) + 1)

    for (const log of Object.values(session.logs)) {
      if (kindOf(log) === 'time') continue // progressão é em kg; séries de tempo contam só no total de séries
      let best: ProgressPoint | null = null
      for (const set of log.sets) {
        if (!set.done) continue
        const point = { date, set, load: parseDecimal(set.load) ?? 0, e1rm: estimated1RM(set) }
        if (!best || point.e1rm > best.e1rm) best = point
      }
      if (!best) continue
      const key = log.name.trim().toLowerCase()
      const entry = exercises.get(key) ?? { name: log.name.trim(), points: [] }
      entry.points.push(best)
      exercises.set(key, entry)
    }
  }

  const planned = weekdays.reduce((n, w) => n + w.planned, 0)
  return {
    from,
    days,
    sessions,
    sets,
    volume,
    planned,
    attended: weekdays.reduce((n, w) => n + w.attended, 0),
    missed: weekdays.reduce((n, w) => n + w.missed, 0),
    extras,
    activityMin,
    cardio,
    replaced,
    weekdays,
    bucketUnit: unit,
    buckets,
    plannedPerWeek: state.trainingDays.filter(Boolean).length,
    byWorkout: [...byWorkout].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byActivity: [...byActivity].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.minutes - a.minutes),
    exercises: [...exercises.values()].sort((a, b) => b.points.length - a.points.length),
  }
}
