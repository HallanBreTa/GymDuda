/** Regras de validação e consultas de séries (Feature 2). */
import type { DayLog, Exercise, ExerciseKind, ExerciseLog, SetLog, Workout, WorkoutSession } from '../types'
import { formatClock } from './rest'

export const kindOf = (x: { kind?: ExerciseKind } | undefined): ExerciseKind => x?.kind ?? 'weight'
export const MAX_SET_TIME_SEC = 3600

export const emptySet = (): SetLog => ({ load: '', reps: '', rir: '', done: false })

/** Aceita "42,5" e "42.5". Retorna null para vazio/inválido. */
export function parseDecimal(value: string): number | null {
  const v = value.trim().replace(',', '.')
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const isInt = (n: number | null): n is number => n !== null && Number.isInteger(n)

export type SetField = 'load' | 'reps' | 'rir' | 'time'
export type SetErrors = Partial<Record<SetField, string>>

export function validateSet(set: SetLog, kind: ExerciseKind = 'weight'): SetErrors {
  const errors: SetErrors = {}
  if (kind === 'time') {
    const sec = parseDecimal(set.time ?? '')
    if (sec === null || sec <= 0) errors.time = 'Informe o tempo'
    else if (!isInt(sec) || sec > MAX_SET_TIME_SEC) errors.time = 'Tempo inválido'
    return errors
  }

  const load = parseDecimal(set.load)
  const reps = parseDecimal(set.reps)
  const rir = parseDecimal(set.rir)

  if (load === null) errors.load = 'Informe a carga'
  else if (load < 0 || load > 999) errors.load = 'Carga inválida'

  if (reps === null) errors.reps = 'Informe as reps'
  else if (!isInt(reps) || reps < 1 || reps > 200) errors.reps = 'Reps inválidas'

  if (rir === null) errors.rir = 'Informe o RIR'
  else if (!isInt(rir) || rir < 0 || rir > 10) errors.rir = 'RIR de 0 a 10'

  return errors
}

export const isSetValid = (set: SetLog, kind: ExerciseKind = 'weight') => Object.keys(validateSet(set, kind)).length === 0

/** Série com algo digitado (decide confirmações de descartar/trocar). */
export const setHasData = (s: SetLog) => !!(s.done || s.load || s.reps || s.rir || s.time)

/** Séries a exibir para um exercício: as registradas ou as prescritas, vazias. */
export function setsFor(session: WorkoutSession | undefined, exercise: Exercise): SetLog[] {
  return session?.logs[exercise.id]?.sets ?? Array.from({ length: Math.max(1, exercise.sets) }, emptySet)
}

export function sessionProgress(session: WorkoutSession | undefined, workout: Workout) {
  let done = 0
  let total = 0
  for (const exercise of workout.exercises) {
    const sets = setsFor(session, exercise)
    total += sets.length
    done += sets.filter((s) => s.done).length
  }
  return { done, total }
}

export function sessionStats(session: WorkoutSession) {
  let sets = 0
  let volume = 0
  let timeSec = 0
  for (const log of Object.values(session.logs)) {
    for (const s of log.sets) {
      if (!s.done) continue
      sets++
      if (kindOf(log) === 'time') timeSec += parseDecimal(s.time ?? '') ?? 0
      else volume += (parseDecimal(s.load) ?? 0) * (parseDecimal(s.reps) ?? 0)
    }
  }
  // Registro retroativo: o tempo entre abrir e concluir é o tempo digitando, não o do treino.
  const minutes = session.finishedAt && !session.retroactive ? Math.max(1, Math.round((session.finishedAt - session.startedAt) / 60_000)) : null
  return { sets, volume: Math.round(volume), timeSec, minutes }
}

/** Remove séries não confirmadas e exercícios sem séries (usado ao concluir o treino). */
export function pruneUnconfirmed(logs: Record<string, ExerciseLog>): Record<string, ExerciseLog> {
  const out: Record<string, ExerciseLog> = {}
  for (const [id, log] of Object.entries(logs)) {
    const sets = log.sets.filter((s) => s.done)
    if (sets.length) out[id] = { ...log, sets }
  }
  return out
}

export const formatSet = (s: SetLog, kind: ExerciseKind = 'weight') =>
  kind === 'time'
    ? formatClock(parseDecimal(s.time ?? '') ?? 0)
    : `${s.load.replace('.', ',')}kg × ${s.reps}${s.rir !== '' ? ` @${s.rir}` : ''}`

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export type PreviousPerformance = { date: string; sets: SetLog[] }

/** Sessões concluídas, da mais recente para a mais antiga. */
export function doneSessionsDesc(history: Record<string, DayLog>): [string, WorkoutSession][] {
  return (Object.entries(history).filter(([, log]) => log.status === 'done') as [string, WorkoutSession][]).sort(
    ([a], [b]) => (a < b ? 1 : -1),
  )
}

/**
 * Última execução registrada de um exercício antes de `beforeDate`.
 * Procura pelo id e, se não achar, pelo nome — assim a memória sobrevive a
 * trocas de divisão ou a recriar o exercício.
 */
export function findPrevious(
  sessionsDesc: [string, WorkoutSession][],
  exercise: Exercise,
  beforeDate: string,
): PreviousPerformance | null {
  const name = normalizeName(exercise.name)
  for (const [date, session] of sessionsDesc) {
    if (date >= beforeDate) continue
    const log =
      session.logs[exercise.id] ?? Object.values(session.logs).find((l) => normalizeName(l.name) === name)
    const sets = log?.sets.filter((s) => s.done)
    if (sets?.length) return { date, sets }
  }
  return null
}
