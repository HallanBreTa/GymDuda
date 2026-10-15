/**
 * Fila sequencial (rolling split).
 *
 * Nada de "segunda = Treino A". O estado guarda só:
 *   - `queue`: a ordem dos treinos (A → B → C → D)
 *   - `pointer`: índice do PRÓXIMO treino a ser feito
 *   - `trainingDays`: em quais dias da semana o usuário pretende treinar
 *   - `history`: o que realmente aconteceu em cada data
 *
 * O que aparece em cada dia é PROJETADO a partir disso. Daí saem as regras pedidas:
 *   - Falta: o ponteiro não anda, então o treino pendente cai no próximo dia de treino
 *     e todos os seguintes são empurrados.
 *   - Treino extra em dia de descanso: consome o próximo da fila, o ponteiro anda,
 *     e a projeção da semana seguinte já começa no treino depois dele.
 *   - Descanso registrado num dia de treino: o ponteiro não anda (equivale a adiar).
 *   - Vários dias pulados / virada de semana: a projeção é feita por datas, não por
 *     semana, então não existe caso especial.
 *   - Atividade avulsa "substituindo" o treino (cardio no lugar do B): igual a uma falta
 *     para a fila (o ponteiro não anda, o B rola para o próximo dia de treino), mas o dia
 *     aparece como "substituído" e não como falta.
 */
import type { Activity, GymState, WorkoutSession } from '../types'
import { addDays, diffDays, todayISO, weekdayOf, workoutBadge } from '../utils'
import { normalizeName } from './sets'

export type DayPlan =
  | { kind: 'done'; session: WorkoutSession }
  | { kind: 'in_progress'; session: WorkoutSession; stale: boolean } // stale = iniciado num dia anterior e não concluído
  | { kind: 'rest_logged' }
  | { kind: 'replaced'; activity: Activity } // treino trocado por uma atividade avulsa
  | { kind: 'missed' } // dia de treino passado sem registro
  | { kind: 'rest' } // descanso planejado (sem registro)
  | { kind: 'pending'; workoutId: string } // hoje, ainda não iniciado
  | { kind: 'planned'; workoutId: string } // futuro (projeção)
  | { kind: 'before_start' } // antes do usuário começar a usar o app

/** Limite de segurança para projeções/varreduras longas. */
const MAX_SCAN_DAYS = 366

const mod = (n: number, m: number) => ((n % m) + m) % m

export const normalizePointer = (pointer: number, queueLength: number) => (queueLength ? mod(pointer, queueLength) : 0)

export function queueAt(state: Pick<GymState, 'queue'>, index: number): string | null {
  return state.queue.length ? state.queue[mod(index, state.queue.length)] : null
}

export const nextWorkoutId = (state: GymState) => queueAt(state, state.pointer)

export const isTrainingDay = (state: GymState, iso: string) => state.trainingDays[weekdayOf(iso)]

/** Atividade avulsa que substituiu o treino da data (no máximo uma por dia). */
export const replacementFor = (state: GymState, iso: string): Activity | null =>
  state.activities[iso]?.find((a) => a.mode === 'replace') ?? null

/**
 * Posição da fila logo depois de hoje: de onde a projeção de amanhã em diante começa.
 * Se hoje é dia de treino ainda não feito, ou se o treino de hoje está em andamento,
 * ele "reserva" o próximo da fila.
 */
function cursorAfterToday(state: GymState, today: string): number {
  const log = state.history[today]
  const next = nextWorkoutId(state)
  if (log?.status === 'in_progress') return log.workoutId === next ? state.pointer + 1 : state.pointer
  if (!log && !replacementFor(state, today) && isTrainingDay(state, today) && next) return state.pointer + 1
  return state.pointer
}

/** Calcula o plano de um conjunto de datas (passadas, hoje ou futuras). */
export function projectDays(state: GymState, dates: string[], today = todayISO()): Record<string, DayPlan> {
  const result: Record<string, DayPlan> = {}
  const futureCursor = cursorAfterToday(state, today)

  for (const date of dates) {
    const log = state.history[date]
    const offset = diffDays(today, date)

    if (log) {
      if (log.status === 'rest') result[date] = { kind: 'rest_logged' }
      else if (log.status === 'done') result[date] = { kind: 'done', session: log }
      else result[date] = { kind: 'in_progress', session: log, stale: offset < 0 }
      continue
    }

    const replacement = replacementFor(state, date)
    if (replacement) {
      result[date] = { kind: 'replaced', activity: replacement }
      continue
    }

    if (offset < 0) {
      if (date < state.startDate) result[date] = { kind: 'before_start' }
      else result[date] = isTrainingDay(state, date) ? { kind: 'missed' } : { kind: 'rest' }
      continue
    }

    if (!isTrainingDay(state, date) || !state.queue.length) {
      result[date] = { kind: 'rest' }
      continue
    }

    if (offset === 0) {
      result[date] = { kind: 'pending', workoutId: nextWorkoutId(state)! }
      continue
    }

    // Futuro: conta quantos dias de treino existem entre amanhã e a data (exclusive).
    let trainingBefore = 0
    for (let i = 1; i < Math.min(offset, MAX_SCAN_DAYS); i++) {
      if (isTrainingDay(state, addDays(today, i))) trainingBefore++
    }
    result[date] = { kind: 'planned', workoutId: queueAt(state, futureCursor + trainingBefore)! }
  }

  return result
}

/** Último treino concluído (data + sessão), ou null. */
export function lastCompleted(state: GymState, before?: string): { date: string; session: WorkoutSession } | null {
  let best: { date: string; session: WorkoutSession } | null = null
  for (const [date, log] of Object.entries(state.history)) {
    if (log.status !== 'done' || (before && date >= before)) continue
    if (!best || date > best.date) best = { date, session: log }
  }
  return best
}

/**
 * Dias de treino perdidos desde o último treino concluído (até ontem).
 * Usado no aviso "você faltou, a fila foi mantida".
 */
export function missedSinceLastWorkout(state: GymState, today = todayISO()): string[] {
  const last = lastCompleted(state, today)
  let from = last ? addDays(last.date, 1) : state.startDate
  if (from < state.startDate) from = state.startDate
  const earliest = addDays(today, -30)
  if (from < earliest) from = earliest

  const missed: string[] = []
  for (let d = from; d < today; d = addDays(d, 1)) {
    if (!state.history[d] && !replacementFor(state, d) && isTrainingDay(state, d)) missed.push(d)
  }
  return missed
}

/** Sessão em andamento de um dia anterior (ex.: começou 23h e virou a meia-noite). */
export function staleSession(state: GymState, today = todayISO()): { date: string; session: WorkoutSession } | null {
  let found: { date: string; session: WorkoutSession } | null = null
  for (const [date, log] of Object.entries(state.history)) {
    if (log.status === 'in_progress' && date < today && (!found || date > found.date)) found = { date, session: log }
  }
  return found
}

type WorkoutRef = Pick<WorkoutSession, 'workoutId' | 'workoutName'>

/**
 * Posição na fila do treino de uma sessão. Procura pelo id e, se ele não existir mais
 * (o plano foi reimportado/trocado e os treinos ganharam ids novos), pelo nome e depois
 * pela letra ("Treino A - …"), desde que a letra seja única na fila. -1 se não achar.
 */
export function matchQueueIndex(state: Pick<GymState, 'queue' | 'workouts'>, ref: WorkoutRef): number {
  const byId = state.queue.indexOf(ref.workoutId)
  if (byId >= 0) return byId

  const queued = state.queue.map((id) => state.workouts.find((w) => w.id === id)?.name ?? '')
  const name = normalizeName(ref.workoutName)
  const byName = queued.findIndex((n) => normalizeName(n) === name)
  if (byName >= 0) return byName

  const letter = workoutBadge(ref.workoutName)
  const sameLetter = queued.flatMap((n, i) => (n && workoutBadge(n) === letter ? [i] : []))
  return sameLetter.length === 1 ? sameLetter[0] : -1
}

/** Ponteiro após concluir uma sessão: só anda se o treino feito era o próximo da fila. */
export function pointerAfterCompletion(state: GymState, session: WorkoutRef): number {
  if (matchQueueIndex(state, session) !== normalizePointer(state.pointer, state.queue.length)) return state.pointer // treino avulso/trocado: a fila fica intacta
  return normalizePointer(state.pointer + 1, state.queue.length)
}

/**
 * Próximo da fila segundo o histórico: o treino depois do último concluído.
 * Usado ao importar/trocar o plano (que antes voltava sempre para o A) e no botão
 * "Recalcular pelo histórico". Sem histórico ou sem correspondência: começa do primeiro.
 */
export function pointerFromHistory(state: GymState): number {
  const sessions = Object.entries(state.history)
    .filter((e): e is [string, WorkoutSession] => e[1].status === 'done')
    .sort(([a, sa], [b, sb]) => (a === b ? (sa.finishedAt ?? 0) - (sb.finishedAt ?? 0) : a < b ? -1 : 1))
  // Do mais recente para trás. Prefere treinos que ANDARAM a fila ao serem concluídos
  // (pointerBefore definido): um treino trocado de propósito (estava no B, fez o D) não move a fila.
  const pick = (onlyAdvanced: boolean) => {
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i][1]
      if (onlyAdvanced && s.pointerBefore === undefined) continue
      const idx = matchQueueIndex(state, s)
      if (idx >= 0) return normalizePointer(idx + 1, state.queue.length)
    }
    return null
  }
  return pick(true) ?? pick(false) ?? 0
}

/** Próximo dia (a partir de `from`, inclusive) com treino previsto/pendente na projeção. */
export function nextPlannedDay(state: GymState, from: string, today = todayISO()): { date: string; workoutId: string } | null {
  if (!state.queue.length || !state.trainingDays.some(Boolean)) return null
  const dates = Array.from({ length: 14 }, (_, i) => addDays(from, i))
  const plans = projectDays(state, dates, today)
  for (const date of dates) {
    const plan = plans[date]
    if (plan.kind === 'pending' || plan.kind === 'planned') return { date, workoutId: plan.workoutId }
  }
  return null
}
