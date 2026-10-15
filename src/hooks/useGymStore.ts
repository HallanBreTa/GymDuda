import { useEffect, useMemo, useState } from 'react'
import { createInitialState, TEMPLATES } from '../data/templates'
import { canReplaceOn } from '../domain/activities'
import { mergeCheckin, sanitizeCheckins, sanitizeWeekGoals } from '../domain/checkins'
import { isTrainingDay, normalizePointer, pointerAfterCompletion, pointerFromHistory, queueAt } from '../domain/queue'
import {
  doneSessionsDesc,
  emptySet,
  findPrevious,
  initialSets,
  isSetValid,
  kindOf,
  normalizeName,
  pruneUnconfirmed,
  suggestedLoadFrom,
} from '../domain/sets'
import type { Activity, ActivityMode, CheckIn, DayLog, Exercise, GymState, SetLog, Workout, WorkoutSession } from '../types'
import { addDays, todayISO, weekdayOf } from '../utils'
import { useCloudSync } from './useCloudSync'

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
  const extras = {
    ...(state.checkins !== undefined && { checkins: sanitizeCheckins(state.checkins) }),
    ...(state.weekGoals !== undefined && { weekGoals: sanitizeWeekGoals(state.weekGoals) }),
  }
  return { ...state, ...extras, queue, pointer: normalizePointer(state.pointer, queue.length) }
}

/** Valida e migra um estado salvo (localStorage ou nuvem). Retorna null se não reconhecer. */
export function parseState(raw: unknown): GymState | null {
  if (isStateV3(raw)) return sanitize(raw)
  if (isStateV2(raw)) return sanitize(migrateV2(raw))
  if (isStateV1(raw)) return sanitize(migrateV2(migrateV1(raw)))
  return null
}

function loadState(): GymState {
  try {
    for (const key of [STORAGE_KEY, LEGACY_KEY_V1]) {
      const raw = localStorage.getItem(key)
      const parsed = raw ? parseState(JSON.parse(raw)) : null
      if (parsed) return parsed
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
    ...(date < todayISO() && { retroactive: true }),
    logs: {},
  }
}

/**
 * Grava uma sessão nova na data. Se uma atividade avulsa "substituía" o treino desse dia,
 * ela vira extra: agora o dia tem treino de verdade.
 */
function withNewSession(s: GymState, date: string, session: WorkoutSession): GymState {
  const list = s.activities[date]
  const activities = list?.some((a) => a.mode === 'replace')
    ? { ...s.activities, [date]: list.map((a) => (a.mode === 'replace' ? { ...a, mode: 'extra' as const } : a)) }
    : s.activities
  return withHistory({ ...s, activities }, date, session)
}

/**
 * Aplica `fn` na sessão em andamento da data, criando-a se ainda não existir.
 * Sessões concluídas são somente leitura (reabra antes de editar).
 */
function editSession(s: GymState, date: string, workoutId: string, fn: (session: WorkoutSession) => WorkoutSession): GymState {
  const existing = s.history[date]
  if (existing?.status === 'done') return s
  if (existing?.status === 'in_progress' && existing.workoutId === workoutId) return withHistory(s, date, fn(existing))
  const workout = s.workouts.find((w) => w.id === workoutId)
  return workout ? withNewSession(s, date, fn(newSession(s, date, workout))) : s
}

/**
 * Aplica `fn` nas séries de um exercício da sessão da data (criando sessão/séries se preciso).
 * Séries novas nascem como a tela as mostra: Kg já preenchido com a última sessão (initialSets).
 */
function editExerciseSets(
  s: GymState,
  date: string,
  workoutId: string,
  exercise: Exercise,
  fn: (sets: SetLog[]) => SetLog[],
): GymState {
  return editSession(s, date, workoutId, (session) => {
    const current =
      session.logs[exercise.id]?.sets ?? initialSets(exercise, findPrevious(doneSessionsDesc(s.history), exercise, date))
    const log = { name: exercise.name, ...(kindOf(exercise) === 'time' && { kind: 'time' as const }), sets: fn(current) }
    return { ...session, logs: { ...session.logs, [exercise.id]: log } }
  })
}

/**
 * Atualiza a "carga sugerida" dos exercícios de peso com a última carga usada na sessão
 * (exercícios com o mesmo id ou o mesmo nome, em qualquer treino). Não sobrescreve com
 * dados mais antigos: se já existe um treino concluído depois desta data com o exercício, pula.
 */
function withLatestLoads(s: GymState, date: string, logs: WorkoutSession['logs']): GymState {
  const later = doneSessionsDesc(s.history).filter(([d]) => d > date)
  const updates = new Map<string, string>() // nome normalizado → carga
  const byId = new Map<string, string>()
  for (const [id, log] of Object.entries(logs)) {
    if (kindOf(log) !== 'weight') continue
    const load = suggestedLoadFrom(log.sets)
    const name = normalizeName(log.name)
    const newer = later.some(([, sess]) => sess.logs[id] || Object.values(sess.logs).some((l) => normalizeName(l.name) === name))
    if (!load || newer) continue
    updates.set(name, load)
    byId.set(id, load)
  }
  if (!updates.size) return s
  const workouts = s.workouts.map((w) => {
    let changed = false
    const exercises = w.exercises.map((e) => {
      if (kindOf(e) !== 'weight') return e
      const load = byId.get(e.id) ?? updates.get(normalizeName(e.name))
      if (!load || load === e.load) return e
      changed = true
      return { ...e, load }
    })
    return changed ? { ...w, exercises } : w
  })
  return { ...s, workouts }
}

/**
 * Troca o plano inteiro (template ou JSON "substituir"). Os treinos ganham ids novos, então a
 * fila é recalculada pelo histórico: se o último concluído foi o "Treino A", o próximo é o B
 * do plano novo (antes voltava sempre para o A). O início da fila não pula os dias já registrados.
 */
function withNewPlan(s: GymState, plan: Pick<GymState, 'workouts' | 'queue' | 'trainingDays'>): GymState {
  const history = Object.fromEntries(Object.entries(s.history).filter(([, log]) => log.status !== 'in_progress'))
  const lastDone = Object.keys(history)
    .filter((d) => history[d].status === 'done')
    .sort()
    .pop()
  const today = todayISO()
  const next: GymState = { ...s, ...plan, history, pointer: 0, startDate: lastDone && lastDone < today ? lastDone : today }
  return { ...next, pointer: pointerFromHistory(next) }
}

/* ---------- Hook ---------- */

export function useGymStore({ onSyncReplaced }: { onSyncReplaced?: () => void } = {}) {
  const [state, setState] = useState<GymState>(loadState)
  const sync = useCloudSync(state, setState, parseState, onSyncReplaced)

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

      /**
       * Inicia (ou troca) o treino de uma data. Trocar descarta o que foi registrado.
       * Funciona também para datas passadas (registro retroativo): substitui um descanso
       * registrado ou uma falta, e ao concluir a fila anda normalmente se era o próximo.
       */
      startSession(date: string, workoutId: string) {
        setState((s) => {
          const existing = s.history[date]
          if (existing?.status === 'done' || date > todayISO()) return s
          if (existing?.status === 'in_progress' && existing.workoutId === workoutId) return s
          const workout = s.workouts.find((w) => w.id === workoutId)
          return workout ? withNewSession(s, date, newSession(s, date, workout)) : s
        })
      },

      updateSet(date: string, workoutId: string, exercise: Exercise, index: number, patch: Partial<Omit<SetLog, 'done'>>) {
        setState((s) =>
          editExerciseSets(s, date, workoutId, exercise, (sets) =>
            sets.map((set, i) => (i === index && !set.done ? { ...set, ...patch } : set)),
          ),
        )
      },

      /** Confirma/desfaz uma série. A confirmação exige carga, reps e RIR válidos. */
      setSetDone(date: string, workoutId: string, exercise: Exercise, index: number, done: boolean) {
        setState((s) =>
          editExerciseSets(s, date, workoutId, exercise, (sets) =>
              sets.map((set, i) => (i !== index || (done && !isSetValid(set, kindOf(exercise))) ? set : { ...set, done })),
          ),
        )
      },

      addSet(date: string, workoutId: string, exercise: Exercise) {
        setState((s) => editExerciseSets(s, date, workoutId, exercise, (sets) => [...sets, emptySet()]))
      },

      removeSet(date: string, workoutId: string, exercise: Exercise, index: number) {
        setState((s) =>
          editExerciseSets(s, date, workoutId, exercise, (sets) =>
            sets.length > 1 && !sets[index]?.done ? sets.filter((_, i) => i !== index) : sets,
          ),
        )
      },

      /** Preenche campos vazios das séries não confirmadas com a última sessão registrada. */
      fillFromPrevious(date: string, workoutId: string, exercise: Exercise, previous: SetLog[]) {
        if (!previous.length) return
        setState((s) =>
          editExerciseSets(s, date, workoutId, exercise, (sets) =>
              sets.map((set, i) => {
                if (set.done) return set
                const p = previous[Math.min(i, previous.length - 1)]
                if (kindOf(exercise) === 'time') return { ...set, time: set.time || p.time }
                return { ...set, load: set.load || p.load, reps: set.reps || p.reps, rir: set.rir || p.rir }
              }),
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
          const pointer = pointerAfterCompletion(s, session)
          const done: WorkoutSession = {
            ...session,
            status: 'done',
            logs,
            finishedAt: Date.now(),
            pointerBefore: pointer !== s.pointer ? s.pointer : undefined,
          }
          // Registrou um treino antes do início da fila (ex.: importou o plano hoje, mas começou
          // na terça): a fila passa a valer a partir desse dia.
          const startDate = date < s.startDate ? date : s.startDate
          // A carga sugerida de cada exercício passa a ser a última usada.
          return withLatestLoads({ ...withHistory(s, date, done), pointer, startDate }, date, logs)
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

      /* ----- Check-in e meta da semana ----- */

      /** Mescla o check-in do dia. Se ficar vazio (sem disposição, dor ou nota), a entrada some. */
      saveCheckin(date: string, patch: Partial<Omit<CheckIn, 'updatedAt'>>) {
        setState((s) => {
          const checkins = { ...s.checkins }
          const next = mergeCheckin(checkins[date], patch)
          if (next) checkins[date] = next
          else delete checkins[date]
          return { ...s, checkins }
        })
      },

      /** Meta de dias na academia da semana (`weekStart` = segunda-feira). null volta ao padrão. */
      setWeekGoal(weekStart: string, goal: number | null) {
        setState((s) => {
          const weekGoals = { ...s.weekGoals }
          if (goal === null) delete weekGoals[weekStart]
          else weekGoals[weekStart] = Math.min(7, Math.max(1, Math.round(goal)))
          return { ...s, weekGoals }
        })
      },

      /* ----- Geral ----- */

      applyTemplate(key: string) {
        const template = TEMPLATES.find((t) => t.key === key)
        if (!template) return
        // Histórico concluído é mantido (a carga anterior é encontrada pelo nome do exercício).
        setState((s) => withNewPlan(s, template.create()))
      },

      /**
       * Importa treinos (ex.: JSON gerado por IA). 'replace' troca a divisão como um template
       * (histórico concluído é mantido); 'add' coloca os novos treinos no fim da fila.
       */
      importPlan(workouts: Workout[], mode: 'replace' | 'add', trainingDays: boolean[] | null) {
        setState((s) => {
          const days = trainingDays ?? s.trainingDays
          if (mode === 'add') {
            const next = { ...s, workouts: [...s.workouts, ...workouts], trainingDays: days }
            return withQueue(next, [...s.queue, ...workouts.map((w) => w.id)])
          }
          return withNewPlan(s, { workouts, queue: workouts.map((w) => w.id), trainingDays: days })
        })
      },

      /** Conserta a fila: o próximo passa a ser o treino depois do último concluído no histórico. */
      recalcQueueFromHistory() {
        setState((s) => ({ ...s, pointer: pointerFromHistory(s) }))
      },

      resetAll() {
        setState(createInitialState())
      },
    }),
    [],
  )

  return { state, sync, ...actions }
}

export type GymStore = ReturnType<typeof useGymStore>
