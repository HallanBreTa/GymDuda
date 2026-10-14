import { useEffect, useMemo, useState } from 'react'
import { createInitialState, TEMPLATES } from '../data/templates'
import { canReplaceOn } from '../domain/activities'
import { isTrainingDay, normalizePointer, pointerAfterCompletion, queueAt } from '../domain/queue'
import { emptySet, isSetValid, pruneUnconfirmed } from '../domain/sets'
import type { Activity, ActivityMode, DayLog, Exercise, GymState, SetLog, Workout, WorkoutSession } from '../types'
import { addDays, todayISO, weekdayOf } from '../utils'

const STORAGE_KEY = 'gymduda:state'
const LEGACY_KEY_V1 = 'gymduda:state:v1'

/* ---------- Carregamento, validação e migração ---------- */

type StateV1 = {
  version: 1
  workouts: Workout[]
  schedule: (string | null)[]
  progress: Record<string, string[]>
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

type StateV2 = Omit<GymState, 'version' | 'activities'> & { version: 2 }

function hasV2Shape(v: Record<string, unknown>) {
  return (
    Array.isArray(v.workouts) &&
    Array.isArray(v.queue) &&
    typeof v.pointer === 'number' &&
    Array.isArray(v.trainingDays) &&
    v.trainingDays.length === 7 &&
    isObject(v.history) &&
    typeof v.startDate === 'string'
  )
}

const isStateV2 = (v: unknown): v is StateV2 => isObject(v) && v.version === 2 && hasV2Shape(v)
const isStateV3 = (v: unknown): v is GymState => isObject(v) && v.version === 3 && hasV2Shape(v) && isObject(v.activities)

function isStateV1(v: unknown): v is StateV1 {
  return isObject(v) && v.version === 1 && Array.isArray(v.workouts) && Array.isArray(v.schedule) && v.schedule.length === 7
}

/**
 * v1 (grade fixa dia → treino) → v2 (fila).
 * A fila segue a ordem em que os treinos apareciam na semana; o ponteiro é ajustado
 * para que o próximo dia de treino mostre o mesmo treino que a grade antiga mostraria.
 */
export function migrateV1(v1: StateV1): StateV2 {
  const scheduled = v1.schedule.filter((id): id is string => !!id && v1.workouts.some((w) => w.id === id))
  const queue = [...new Set(scheduled), ...v1.workouts.map((w) => w.id).filter((id) => !scheduled.includes(id))]
  const trainingDays = v1.schedule.map((id) => id !== null)

  const today = todayISO()
  let pointer = 0
  for (let i = 0; i < 7; i++) {
    const day = weekdayOf(addDays(today, i))
    if (trainingDays[day]) {
      pointer = Math.max(0, queue.indexOf(v1.schedule[day]!))
      break
    }
  }

  return { version: 2, workouts: v1.workouts, queue, pointer, trainingDays, history: {}, startDate: today }
}

/** v2 → v3: adiciona o mapa de atividades avulsas. */
const migrateV2 = (v2: StateV2): GymState => ({ ...v2, version: 3, activities: {} })

/** Corrige referências quebradas (ex.: id na fila que não existe mais). */
function sanitize(state: GymState): GymState {
  const ids = new Set(state.workouts.map((w) => w.id))
  const queue = state.queue.filter((id) => ids.has(id))
  return { ...state, queue, pointer: normalizePointer(state.pointer, queue.length) }
}

function loadState(): GymState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isStateV3(parsed)) return sanitize(parsed)
      if (isStateV2(parsed)) return sanitize(migrateV2(parsed))
    }
    const legacy = localStorage.getItem(LEGACY_KEY_V1)
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy)
      if (isStateV1(parsed)) return sanitize(migrateV2(migrateV1(parsed)))
    }
  } catch {
    // localStorage indisponível ou JSON corrompido: começa com os dados padrão
  }
  return createInitialState()
}

/* ---------- Helpers puros de atualização ---------- */

const withHistory = (s: GymState, date: string, log: DayLog | null): GymState => {
  const history = { ...s.history }
  if (log) history[date] = log
  else delete history[date]
  return { ...s, history }
}

/** Mantém o mesmo treino como "próximo" depois de reordenar/editar a fila. */
function withQueue(s: GymState, queue: string[], keepNextId = queueAt(s, s.pointer)): GymState {
  const idx = keepNextId ? queue.indexOf(keepNextId) : -1
  const pointer = idx >= 0 ? idx : normalizePointer(s.pointer, queue.length)
  return { ...s, queue, pointer }
}

/** Tira um treino da fila. Se ele era o próximo, o próximo passa a ser o que vinha depois dele. */
function withoutInQueue(s: GymState, id: string): GymState {
  const next = queueAt(s, s.pointer)
  const removedIdx = s.queue.indexOf(id)
  const queue = s.queue.filter((wid) => wid !== id)
  const keep = next === id ? (queue.length ? queue[normalizePointer(removedIdx, queue.length)] : null) : next
  return withQueue(s, queue, keep)
}

function newSession(s: GymState, date: string, workout: Workout): WorkoutSession {
  return {
    status: 'in_progress',
    workoutId: workout.id,
    workoutName: workout.name,
    workoutColor: workout.color,
    extra: !isTrainingDay(s, date),
    startedAt: Date.now(),
    logs: {},
  }
}

/**
 * Aplica `fn` na sessão em andamento da data, criando-a se ainda não existir.
 * Sessões concluídas são somente leitura (reabra antes de editar).
 */
function editSession(s: GymState, date: string, workoutId: string, fn: (session: WorkoutSession) => WorkoutSession): GymState {
  const existing = s.history[date]
  if (existing?.status === 'done') return s
  let session: WorkoutSession
  if (existing?.status === 'in_progress' && existing.workoutId === workoutId) {
    session = existing
  } else {
    const workout = s.workouts.find((w) => w.id === workoutId)
    if (!workout) return s
    session = newSession(s, date, workout)
  }
  return withHistory(s, date, fn(session))
}

function editSets(session: WorkoutSession, exercise: Exercise, fn: (sets: SetLog[]) => SetLog[]): WorkoutSession {
  const current = session.logs[exercise.id]?.sets ?? Array.from({ length: Math.max(1, exercise.sets) }, emptySet)
  return { ...session, logs: { ...session.logs, [exercise.id]: { name: exercise.name, sets: fn(current) } } }
}

/* ---------- Hook ---------- */

export function useGymStore() {
  const [state, setState] = useState<GymState>(loadState)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      localStorage.removeItem(LEGACY_KEY_V1)
    } catch {
      // modo privado / cota cheia: o app continua funcionando em memória
    }
  }, [state])

  const actions = useMemo(
    () => ({
      /* ----- Treinos ----- */

      saveWorkout(workout: Workout) {
        setState((s) => {
          const exists = s.workouts.some((w) => w.id === workout.id)
          if (exists) return { ...s, workouts: s.workouts.map((w) => (w.id === workout.id ? workout : w)) }
          return withQueue({ ...s, workouts: [...s.workouts, workout] }, [...s.queue, workout.id]) // novo treino entra no fim da fila
        })
      },

      deleteWorkout(id: string) {
        setState((s) => {
          // Sessões concluídas guardam snapshot e continuam no histórico; em andamento são descartadas.
          const history = Object.fromEntries(
            Object.entries(s.history).filter(([, log]) => !(log.status === 'in_progress' && log.workoutId === id)),
          )
          return withoutInQueue({ ...s, workouts: s.workouts.filter((w) => w.id !== id), history }, id)
        })
      },

      /* ----- Fila e dias de treino ----- */

      setTrainingDay(day: number, on: boolean) {
        setState((s) => ({ ...s, trainingDays: s.trainingDays.map((v, i) => (i === day ? on : v)) }))
      },

      moveInQueue(index: number, dir: -1 | 1) {
        setState((s) => {
          const target = index + dir
          if (target < 0 || target >= s.queue.length) return s
          const queue = [...s.queue]
          ;[queue[index], queue[target]] = [queue[target], queue[index]]
          return withQueue(s, queue)
        })
      },

      removeFromQueue(id: string) {
        setState((s) => withoutInQueue(s, id))
      },

      addToQueue(id: string) {
        setState((s) => (s.queue.includes(id) ? s : withQueue(s, [...s.queue, id])))
      },

      setNextWorkout(id: string) {
        setState((s) => {
          const idx = s.queue.indexOf(id)
          return idx < 0 ? s : { ...s, pointer: idx }
        })
      },

      /* ----- Sessão do dia ----- */

      /** Inicia (ou troca) o treino de uma data. Trocar descarta o que foi registrado. */
      startSession(date: string, workoutId: string) {
        setState((s) => {
          const existing = s.history[date]
          if (existing?.status === 'done') return s
          if (existing?.status === 'in_progress' && existing.workoutId === workoutId) return s
          const workout = s.workouts.find((w) => w.id === workoutId)
          return workout ? withHistory(s, date, newSession(s, date, workout)) : s
        })
      },

      updateSet(date: string, workoutId: string, exercise: Exercise, index: number, patch: Partial<Omit<SetLog, 'done'>>) {
        setState((s) =>
          editSession(s, date, workoutId, (session) =>
            editSets(session, exercise, (sets) => sets.map((set, i) => (i === index && !set.done ? { ...set, ...patch } : set))),
          ),
        )
      },

      /** Confirma/desfaz uma série. A confirmação exige carga, reps e RIR válidos. */
      setSetDone(date: string, workoutId: string, exercise: Exercise, index: number, done: boolean) {
        setState((s) =>
          editSession(s, date, workoutId, (session) =>
            editSets(session, exercise, (sets) =>
              sets.map((set, i) => (i !== index || (done && !isSetValid(set)) ? set : { ...set, done })),
            ),
          ),
        )
      },

      addSet(date: string, workoutId: string, exercise: Exercise) {
        setState((s) => editSession(s, date, workoutId, (session) => editSets(session, exercise, (sets) => [...sets, emptySet()])))
      },

      removeSet(date: string, workoutId: string, exercise: Exercise, index: number) {
        setState((s) =>
          editSession(s, date, workoutId, (session) =>
            editSets(session, exercise, (sets) => (sets.length > 1 && !sets[index]?.done ? sets.filter((_, i) => i !== index) : sets)),
          ),
        )
      },

      /** Preenche campos vazios das séries não confirmadas com a última sessão registrada. */
      fillFromPrevious(date: string, workoutId: string, exercise: Exercise, previous: SetLog[]) {
        if (!previous.length) return
        setState((s) =>
          editSession(s, date, workoutId, (session) =>
            editSets(session, exercise, (sets) =>
              sets.map((set, i) => {
                if (set.done) return set
                const p = previous[Math.min(i, previous.length - 1)]
                return { ...set, load: set.load || p.load, reps: set.reps || p.reps, rir: set.rir || p.rir }
              }),
            ),
          ),
        )
      },

      /** Conclui o treino: guarda só as séries confirmadas e avança a fila (se era o próximo). */
      completeSession(date: string) {
        setState((s) => {
          const session = s.history[date]
          if (session?.status !== 'in_progress') return s
          const logs = pruneUnconfirmed(session.logs)
          if (!Object.keys(logs).length) return s
          const pointer = pointerAfterCompletion(s, session.workoutId)
          const done: WorkoutSession = {
            ...session,
            status: 'done',
            logs,
            finishedAt: Date.now(),
            pointerBefore: pointer !== s.pointer ? s.pointer : undefined,
          }
          return { ...withHistory(s, date, done), pointer }
        })
      },

      /** Reabre um treino concluído. Devolve o ponteiro se nada mais andou a fila depois. */
      reopenSession(date: string) {
        setState((s) => {
          const session = s.history[date]
          if (session?.status !== 'done') return s
          const reopened: WorkoutSession = { ...session, status: 'in_progress', finishedAt: undefined, pointerBefore: undefined }
          const canRestore =
            session.pointerBefore !== undefined && s.pointer === normalizePointer(session.pointerBefore + 1, s.queue.length)
          return { ...withHistory(s, date, reopened), pointer: canRestore ? session.pointerBefore! : s.pointer }
        })
      },

      /** Registra descanso. Num dia de treino isso adia a fila: o treino pendente vai para o próximo dia. */
      logRest(date: string) {
        setState((s) => (s.history[date]?.status === 'done' ? s : withHistory(s, date, { status: 'rest', loggedAt: Date.now() })))
      },

      /** Desfaz descanso registrado ou descarta treino em andamento. Nunca apaga treino concluído. */
      clearDay(date: string) {
        setState((s) => (s.history[date]?.status === 'done' ? s : withHistory(s, date, null)))
      },

      /* ----- Atividades avulsas ----- */

      /**
       * Cria ou atualiza uma atividade. `previousDate` permite corrigir o dia de uma
       * atividade já registrada. "Substituir treino" só vale onde é permitido
       * (canReplaceOn); fora disso a atividade é salva como extra.
       */
      saveActivity(date: string, activity: Activity, today: string, previousDate?: string) {
        setState((s) => {
          const activities = { ...s.activities }
          const from = previousDate ?? date
          activities[from] = (activities[from] ?? []).filter((a) => a.id !== activity.id)
          if (!activities[from].length) delete activities[from]

          const base = { ...s, activities }
          const mode: ActivityMode =
            activity.mode === 'replace' && canReplaceOn(base, date, today, activity.id) ? 'replace' : 'extra'
          activities[date] = [...(activities[date] ?? []), { ...activity, mode }].sort((a, b) => a.createdAt - b.createdAt)
          return base
        })
      },

      deleteActivity(date: string, id: string) {
        setState((s) => {
          const list = (s.activities[date] ?? []).filter((a) => a.id !== id)
          const activities = { ...s.activities, [date]: list }
          if (!list.length) delete activities[date]
          return { ...s, activities }
        })
      },

      /** Ex.: "Desfazer substituição" → a atividade vira extra e o treino volta para o dia. */
      setActivityMode(date: string, id: string, mode: ActivityMode, today: string) {
        setState((s) => {
          if (mode === 'replace' && !canReplaceOn(s, date, today, id)) return s
          const list = (s.activities[date] ?? []).map((a) => (a.id === id ? { ...a, mode } : a))
          return { ...s, activities: { ...s.activities, [date]: list } }
        })
      },

      /* ----- Geral ----- */

      applyTemplate(key: string) {
        const template = TEMPLATES.find((t) => t.key === key)
        if (!template) return
        setState((s) => {
          const history = Object.fromEntries(Object.entries(s.history).filter(([, log]) => log.status !== 'in_progress'))
          // Histórico concluído é mantido (a carga anterior é encontrada pelo nome do exercício).
          return { ...s, ...template.create(), pointer: 0, history, startDate: todayISO() }
        })
      },

      resetAll() {
        setState(createInitialState())
      },
    }),
    [],
  )

  return { state, ...actions }
}

export type GymStore = ReturnType<typeof useGymStore>
