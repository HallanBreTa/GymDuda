/**
 * Sequência de dias propostos cumpridos, moedas e congelamentos (gamificação).
 *
 * Tudo é derivado do histórico: só as compras de congelamento são salvas (`state.freezePurchases`).
 * Registrar um treino esquecido, reabrir uma sessão ou mudar os dias de treino recalcula sequência,
 * moedas e estoque sozinho. Spec: docs/superpowers/specs/2026-10-16-sequencia-moedas-design.md
 */
import type { FreezePurchase, GymState } from '../types'
import { addDays } from '../utils'
import { isTrainingDay, projectDays, type DayPlan } from './queue'

export const COINS_PER_DAY = 10
export const COINS_REST_EXTRA = 5
export const FREEZE_PRICE = 50
export const MAX_FREEZES = 2
/** Sequência atingida → bônus em moedas (pago toda vez que a sequência chega ao valor). */
export const MILESTONES: Record<number, number> = { 7: 20, 30: 50, 100: 100 }

export type DayOutcome = 'kept' | 'frozen' | 'broken' | 'pending' | 'rest_active' | 'rest'

export type DayResult = { outcome: DayOutcome; coins: number; streak: number; milestone?: number }

export type StreakResult = {
  current: number
  best: number
  earned: number
  /** Moedas disponíveis: ganhas − compras, nunca negativo. */
  balance: number
  /** Congelamentos em estoque hoje (0..MAX_FREEZES). */
  freezes: number
  days: Record<string, DayResult>
  today: 'kept' | 'pending' | 'rest' | 'rest_active'
  nextMilestone: { at: number; bonus: number; remaining: number } | null
  /** Falta que zerou uma sequência, enquanto não houver dia cumprido depois dela. */
  lastBreak: { date: string; length: number } | null
}

/** Antes de aplicar o estoque: 'missed' vira 'frozen' ou 'broken'. */
type RawOutcome = Exclude<DayOutcome, 'frozen' | 'broken'> | 'missed'

/**
 * Resultado bruto de um dia. Dias antes de `startDate` (plano trocado) valem como os demais: o
 * cálculo começa no primeiro dia com dados, então faltas antigas não somem.
 */
function classify(state: GymState, date: string, plan: DayPlan, today: string): RawOutcome {
  if (isTrainingDay(state, date)) {
    if (plan.kind === 'done' || plan.kind === 'replaced') return 'kept'
    // Sem registro, "Descansou" ou sessão iniciada e não concluída. Hoje ainda dá tempo.
    return date === today ? 'pending' : 'missed'
  }
  return plan.kind === 'done' || (state.activities[date]?.length ?? 0) > 0 ? 'rest_active' : 'rest'
}

const MILESTONE_STEPS = Object.keys(MILESTONES)
  .map(Number)
  .sort((a, b) => a - b)

/** Limite de dias varridos para trás (~10 anos): proteção contra datas corrompidas. */
const MAX_SCAN_DAYS = 3660

/**
 * Percorre dia a dia do primeiro dia com dados (o menor entre `startDate` e os registros) até hoje.
 * Trocar o plano move `startDate` para frente, mas não apaga faltas antigas.
 */
export function computeStreak(state: GymState, today: string): StreakResult {
  const earliest = [state.startDate, ...Object.keys(state.history), ...Object.keys(state.activities)].filter((d) => d <= today).sort()[0] ?? today
  const limit = addDays(today, -MAX_SCAN_DAYS)
  const first = earliest < limit ? limit : earliest
  const dates: string[] = []
  for (let d = first; d <= today; d = addDays(d, 1)) dates.push(d)
  const plans = projectDays(state, dates, today)
  const purchases = [...(state.freezePurchases ?? [])].sort((a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1))

  const days: Record<string, DayResult> = {}
  let nextPurchase = 0
  let freezes = 0
  let current = 0
  let best = 0
  let earned = 0
  let lastBreak: StreakResult['lastBreak'] = null

  for (const date of dates) {
    // Compras feitas até esta data entram no estoque antes de o dia ser avaliado.
    while (nextPurchase < purchases.length && purchases[nextPurchase].date <= date) {
      freezes = Math.min(MAX_FREEZES, freezes + 1)
      nextPurchase++
    }

    const raw = classify(state, date, plans[date], today)
    let outcome: DayOutcome
    let coins = 0
    let milestone: number | undefined
    if (raw === 'kept') {
      outcome = 'kept'
      current++
      best = Math.max(best, current)
      coins = COINS_PER_DAY
      if (MILESTONES[current]) {
        milestone = current
        coins += MILESTONES[current]
      }
      lastBreak = null
    } else if (raw === 'missed') {
      if (freezes > 0) {
        freezes--
        outcome = 'frozen'
      } else {
        if (current > 0) lastBreak = { date, length: current }
        current = 0
        outcome = 'broken'
      }
    } else {
      outcome = raw
      if (raw === 'rest_active') coins = COINS_REST_EXTRA
    }

    earned += coins
    days[date] = { outcome, coins, streak: current, ...(milestone && { milestone }) }
  }

  const todayOutcome = days[today]?.outcome
  const upcoming = MILESTONE_STEPS.find((m) => m > current)
  return {
    current,
    best,
    earned,
    balance: Math.max(0, earned - FREEZE_PRICE * purchases.length),
    freezes,
    days,
    today: todayOutcome === 'kept' || todayOutcome === 'pending' || todayOutcome === 'rest_active' ? todayOutcome : 'rest',
    nextMilestone: upcoming ? { at: upcoming, bonus: MILESTONES[upcoming], remaining: upcoming - current } : null,
    lastBreak,
  }
}

export type BuyCheck = { ok: true } | { ok: false; reason: 'coins'; missing: number } | { ok: false; reason: 'full' }

export function canBuyFreeze(r: Pick<StreakResult, 'balance' | 'freezes'>): BuyCheck {
  if (r.freezes >= MAX_FREEZES) return { ok: false, reason: 'full' }
  if (r.balance < FREEZE_PRICE) return { ok: false, reason: 'coins', missing: FREEZE_PRICE - r.balance }
  return { ok: true }
}

/** Grava a compra só se o saldo e o estoque permitirem (recalcula a partir do estado recebido). */
export function withFreezePurchase(state: GymState, today: string, purchase: FreezePurchase): GymState {
  if (!canBuyFreeze(computeStreak(state, today)).ok) return state
  return { ...state, freezePurchases: [...(state.freezePurchases ?? []), purchase] }
}

/** Valida compras vindas do armazenamento/nuvem, descartando as inválidas. */
export function sanitizeFreezePurchases(raw: unknown): FreezePurchase[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((p: unknown): p is FreezePurchase => {
    const v = p as Partial<FreezePurchase> | null
    return !!v && typeof v.id === 'string' && typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && typeof v.at === 'number'
  })
}

const daysLabel = (n: number) => `${n} ${n === 1 ? 'dia seguido' : 'dias seguidos'}`

/**
 * Texto da comemoração depois de uma ação (concluir treino, registrar atividade…), comparando o
 * resultado de antes com o de depois. Prioridade: marco > hoje cumprido com sequência > treino
 * registrado (dia antigo) > extra. As moedas somam todos os dias que ganharam. null = nada a comemorar.
 */
export function streakEventText(prev: StreakResult, next: StreakResult): string | null {
  const gained = Object.entries(next.days).filter(([d, r]) => r.coins > (prev.days[d]?.coins ?? 0))
  const total = gained.reduce((sum, [d, r]) => sum + r.coins - (prev.days[d]?.coins ?? 0), 0)
  const milestone = gained.find(([d, r]) => r.milestone && prev.days[d]?.milestone !== r.milestone)?.[1].milestone
  if (milestone) return `🏅 ${daysLabel(milestone)}! +${MILESTONES[milestone]} moedas de bônus`
  const lastDay = Object.keys(next.days).at(-1)
  if (next.current > 0 && gained.some(([d, r]) => d === lastDay && r.outcome === 'kept')) return `🔥 ${daysLabel(next.current)} · +${total} moedas`
  if (gained.some(([, r]) => r.outcome === 'kept')) return `+${total} moedas · treino registrado`
  if (gained.some(([, r]) => r.outcome === 'rest_active')) return `+${total} moedas · treino extra`
  return null
}
