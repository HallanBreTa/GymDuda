# Sequência, moedas e congelamentos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gamificar a regularidade no estilo Duolingo. O app mostra uma sequência de dias de treino cumpridos, dá
moedas por dia cumprido, e as moedas compram congelamentos que mantêm a sequência numa falta.

**Architecture:** Tudo é derivado do histórico que já existe, por uma função pura (`computeStreak`) em
`src/domain/streak.ts`. Essa função reaproveita `projectDays` (`src/domain/queue.ts`). Só as compras de congelamento
são salvas, num campo opcional novo (`GymState.freezePurchases`), sem migração. A UI lê o resultado guardado com
`useMemo` no `App` e o passa para a aba Início, para o selo no topo e para as comemorações (Toast).

**Tech Stack:** React 19, TypeScript strict (`verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`),
Vite 8, Tailwind v4 e `lucide-react` 1.55. Os testes são scripts Node que carregam os módulos TS pelo Vite SSR.

**Spec:** `docs/superpowers/specs/2026-10-16-sequencia-moedas-design.md`

## Global Constraints

- O estado continua em `version: 3`. O campo novo é **opcional**: estados antigos e a nuvem continuam válidos.
- `COINS_PER_DAY = 10`, `COINS_REST_EXTRA = 5`, `FREEZE_PRICE = 50`, `MAX_FREEZES = 2`, `MILESTONES = { 7: 20, 30: 50, 100: 100 }`.
- Dia cumprido: dia de treino (`trainingDays`) com sessão `done` **ou** atividade `mode: 'replace'`.
- Falta: dia de treino **passado** sem isso, incluindo "Descansou" e sessão `in_progress` antiga. Hoje nunca é falta.
- Uma compra feita na data P cobre faltas em datas ≥ P. A compra é sempre manual e o uso é automático.
- Saldo = `max(0, earned − 50 × compras)`.
- Os textos ficam em português. O código segue o estilo do repo: sem ponto e vírgula, aspas simples, comentários em
  português e largura de linha ~140.
- **Nunca fazer `git push`**: o push na `master` faz deploy automático. Commits locais estão liberados.
- Os scripts Python e os comandos `node` rodam no Git Bash a partir da raiz do repo (`D:\GymDuda\GymDuda`).
  Heredocs do Git Bash quebram com acentos: para editar arquivos, usar a ferramenta Edit/Write.

## Review Focus

1. **Virada do dia com o app aberto:** o treino de ontem que ficou pendente vira falta (congelada ou quebrada) quando
   `today` muda, sem disparar comemoração. Teste no Task 1 ("virada do dia").
2. **Mudança de dias de treino:** desmarcar um dia na aba Semana reclassifica faltas antigas daquele dia da semana como
   descanso. Teste no Task 1 ("trainingDays reclassifica").
3. **Dois toques rápidos em Comprar com saldo para um só:** só uma compra deve ser gravada. Teste no Task 1
   (`withFreezePurchase` encadeado).
4. **Compra com data no futuro** (relógio do aparelho errado ou dado vindo de outro fuso): conta no saldo, mas não entra
   no estoque antes da data. Teste no Task 1 ("compra futura").
5. **Dados da nuvem chegando logo depois de uma ação:** a comemoração só usa a janela de 2 s depois da ação e mostra no
   máximo um aviso. Verificação manual no Task 4, passo 6.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/types.ts` (modificar) | Tipo `FreezePurchase` e campo `GymState.freezePurchases?` |
| `src/domain/streak.ts` (criar) | Regras, `computeStreak`, `canBuyFreeze`, `withFreezePurchase`, `sanitizeFreezePurchases`, `streakEventText` |
| `tests/streak.test.mjs` (criar) | Testes de domínio (Node + Vite SSR) |
| `src/hooks/useGymStore.ts` (modificar) | `sanitize` das compras e ação `buyFreeze` |
| `src/components/StreakCard.tsx` (criar) | Card da sequência e loja (`BottomSheet`) |
| `src/views/HomeView.tsx` (modificar) | Mostra o `StreakCard` e o ❄ no calendário "Esta semana" |
| `src/components/Navigation.tsx` (modificar) | `StreakBadge` (🔥 N) no topo |
| `src/hooks/useStreakEvents.ts` (criar) | Comemoração depois de ações do usuário |
| `src/App.tsx` (modificar) | Calcula o `streak` e liga selo, Início e comemorações |

---

### Task 1: Domínio — `computeStreak` e regras (TDD)

**Files:**
- Modify: `src/types.ts` (fim do tipo `GymState`, depois de `checkins?`)
- Create: `src/domain/streak.ts`
- Test: `tests/streak.test.mjs`

**Interfaces:**
- Consumes:
  - `projectDays(state, dates, today): Record<string, DayPlan>` e `isTrainingDay(state, iso)` de `src/domain/queue.ts`.
  - `addDays(iso, n)` de `src/utils.ts`.
  - `createInitialState()` de `src/data/templates.ts` (só nos testes).
- Produces:
  ```ts
  // src/types.ts
  export type FreezePurchase = { id: string; date: string; at: number }
  // GymState: freezePurchases?: FreezePurchase[]

  // src/domain/streak.ts
  export const COINS_PER_DAY: number; COINS_REST_EXTRA: number; FREEZE_PRICE: number; MAX_FREEZES: number
  export const MILESTONES: Record<number, number>
  export type DayOutcome = 'kept' | 'frozen' | 'broken' | 'pending' | 'rest_active' | 'rest' | 'ignored'
  export type DayResult = { outcome: DayOutcome; coins: number; streak: number; milestone?: number }
  export type StreakResult = {
    current: number; best: number; earned: number; balance: number; freezes: number
    days: Record<string, DayResult>
    today: 'kept' | 'pending' | 'rest' | 'rest_active'
    nextMilestone: { at: number; bonus: number; remaining: number } | null
    lastBreak: { date: string; length: number } | null
  }
  export type BuyCheck = { ok: true } | { ok: false; reason: 'coins'; missing: number } | { ok: false; reason: 'full' }
  export function computeStreak(state: GymState, today: string): StreakResult
  export function canBuyFreeze(r: Pick<StreakResult, 'balance' | 'freezes'>): BuyCheck
  export function withFreezePurchase(state: GymState, today: string, purchase: FreezePurchase): GymState
  export function sanitizeFreezePurchases(raw: unknown): FreezePurchase[]
  export function streakEventText(prev: StreakResult, next: StreakResult): string | null
  ```

- [ ] **Step 1: Adicionar o tipo em `src/types.ts`**

Dentro de `GymState`, logo depois da linha `checkins?: Record<string, CheckIn>`:

```ts
  /** Compras de congelamento (gamificação). Sequência e moedas são derivadas do histórico; só isto é salvo. */
  freezePurchases?: FreezePurchase[]
```

E, logo depois do tipo `CheckIn`:

```ts
/* ---------- Gamificação ---------- */

/** `date`: dia da compra (yyyy-mm-dd); o congelamento cobre faltas a partir dele. */
export type FreezePurchase = { id: string; date: string; at: number }
```

- [ ] **Step 2: Escrever os testes que devem falhar**

Criar `tests/streak.test.mjs`:

```js
// Testes de domínio da sequência/moedas. Rodar da raiz do repo: node tests/streak.test.mjs "$(pwd)"
import { createServer } from 'vite'
import assert from 'node:assert/strict'

const server = await createServer({ root: process.argv[2] ?? process.cwd(), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const S = await server.ssrLoadModule('/src/domain/streak.ts')
const T = await server.ssrLoadModule('/src/data/templates.ts')
let ok = 0
let failed = 0
const t = (name, fn) => {
  try {
    fn()
    ok++
    console.log('OK -', name)
  } catch (e) {
    failed++
    console.log('FALHOU -', name, '\n   ', e.message)
  }
}

// Calendário: 2026-09-28 é segunda. Dias de treino: seg, ter, qui, sex.
const TODAY = '2026-10-14' // quarta (descanso)
const add = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  const x = new Date(y, m - 1, d + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const weekday = (iso) => (new Date(`${iso}T12:00`).getDay() + 6) % 7
function base() {
  const s = T.createInitialState()
  s.startDate = '2026-09-28'
  s.trainingDays = [true, true, false, true, true, false, false]
  s.history = {}
  s.activities = {}
  return s
}
function done(s, date, status = 'done') {
  const w = s.workouts[0]
  s.history[date] = { status, workoutId: w.id, workoutName: w.name, workoutColor: w.color, extra: false, startedAt: 0, finishedAt: 1, logs: {} }
}
function act(s, date, mode = 'extra') {
  ;(s.activities[date] ??= []).push({ id: `${date}-${mode}`, type: 'run', durationMin: 30, distanceKm: null, intensity: null, calories: null, notes: '', mode, createdAt: 1 })
}
const buy = (s, date) => (s.freezePurchases ??= []).push({ id: `f${s.freezePurchases?.length ?? 0}-${date}`, date, at: 1 })
/** Marca como feito todo dia de treino entre from e to (inclusive), exceto `skip`. */
function doneAll(s, from, to, skip = []) {
  for (let d = from; d <= to; d = add(d, 1)) if (s.trainingDays[weekday(d)] && !skip.includes(d)) done(s, d)
}

t('sequência cresce; descanso hoje não muda nada', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13') // 10 dias de treino
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.current, 10)
  assert.equal(r.best, 10)
  assert.equal(r.earned, 10 * 10 + 20) // bônus ao chegar a 7
  assert.equal(r.balance, 120)
  assert.equal(r.today, 'rest')
  assert.deepEqual(r.nextMilestone, { at: 30, bonus: 50, remaining: 20 })
  assert.equal(r.days['2026-10-08'].milestone, 7) // 7º dia cumprido: seg 28/09, ter, qui, sex, seg 05/10, ter, qui 08/10
})

t('hoje (dia de treino) pendente não quebra', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13')
  const r = S.computeStreak(s, '2026-10-15') // quinta
  assert.equal(r.today, 'pending')
  assert.equal(r.days['2026-10-15'].outcome, 'pending')
  assert.equal(r.current, 10)
})

t('falta sem congelamento zera e registra lastBreak', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13', ['2026-10-06'])
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.days['2026-10-06'].outcome, 'broken')
  assert.equal(r.current, 4)
  assert.equal(r.best, 5)
  assert.equal(r.earned, 90)
  assert.deepEqual(r.lastBreak, { date: '2026-10-06', length: 5 })
})

t('falta com congelamento mantém e gasta', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13', ['2026-10-06'])
  buy(s, '2026-10-01')
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.days['2026-10-06'].outcome, 'frozen')
  assert.equal(r.days['2026-10-06'].streak, 5)
  assert.equal(r.current, 9)
  assert.equal(r.freezes, 0)
  assert.equal(r.earned, 9 * 10 + 20)
  assert.equal(r.balance, 110 - 50)
  assert.equal(r.lastBreak, null)
})

t('compra de hoje não cobre a falta de ontem', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13', ['2026-10-13'])
  buy(s, TODAY)
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.days['2026-10-13'].outcome, 'broken')
  assert.equal(r.current, 0)
  assert.equal(r.freezes, 1)
  assert.deepEqual(r.lastBreak, { date: '2026-10-13', length: 9 })
})

t('estoque máximo 2 e saldo nunca negativo', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13')
  buy(s, '2026-09-28')
  buy(s, '2026-09-28')
  buy(s, '2026-09-28')
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.freezes, 2)
  assert.equal(r.earned, 120)
  assert.equal(r.balance, 0) // 120 − 150 → 0
})

t('"Descansou" num dia de treino conta como falta', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13', ['2026-10-06'])
  s.history['2026-10-06'] = { status: 'rest', loggedAt: 1 }
  assert.equal(S.computeStreak(s, TODAY).days['2026-10-06'].outcome, 'broken')
})

t('sessão antiga não concluída conta como falta', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13', ['2026-10-06'])
  done(s, '2026-10-06', 'in_progress')
  assert.equal(S.computeStreak(s, TODAY).days['2026-10-06'].outcome, 'broken')
})

t('extra no descanso: +5 uma vez por dia, sem mexer na sequência', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13')
  done(s, '2026-10-03') // sábado: treino extra
  act(s, '2026-10-03') // e cardio no mesmo dia
  const r = S.computeStreak(s, TODAY)
  assert.deepEqual(r.days['2026-10-03'], { outcome: 'rest_active', coins: 5, streak: 4 })
  assert.equal(r.days['2026-10-04'].outcome, 'rest')
  assert.equal(r.current, 10)
  assert.equal(r.earned, 125)
})

t('atividade "no lugar do treino" conta como dia cumprido', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13', ['2026-10-06'])
  act(s, '2026-10-06', 'replace')
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.days['2026-10-06'].outcome, 'kept')
  assert.equal(r.current, 10)
})

t('marco se repete depois de uma quebra', () => {
  const s = base()
  s.startDate = '2026-09-01'
  s.trainingDays = Array(7).fill(true)
  for (let d = '2026-09-01'; d <= '2026-09-15'; d = add(d, 1)) if (d !== '2026-09-08') done(s, d)
  const r = S.computeStreak(s, '2026-09-15')
  assert.equal(r.days['2026-09-07'].milestone, 7)
  assert.equal(r.days['2026-09-08'].outcome, 'broken')
  assert.equal(r.days['2026-09-15'].milestone, 7)
  assert.equal(r.earned, 14 * 10 + 2 * 20)
})

t('registro retroativo devolve o congelamento', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13', ['2026-10-06'])
  buy(s, '2026-10-01')
  done(s, '2026-10-06') // registrou depois o treino que tinha esquecido
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.days['2026-10-06'].outcome, 'kept')
  assert.equal(r.freezes, 1)
  assert.equal(r.current, 10)
})

t('virada do dia: pendente de ontem vira falta', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-12')
  assert.equal(S.computeStreak(s, '2026-10-13').today, 'pending')
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.days['2026-10-13'].outcome, 'broken')
  assert.equal(r.current, 0)
})

t('trainingDays reclassifica dias antigos', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13', ['2026-10-06'])
  s.trainingDays = [true, false, false, true, true, false, false] // terça deixou de ser dia de treino
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.days['2026-10-06'].outcome, 'rest') // terça sem treino: descanso comum
  assert.equal(r.days['2026-10-13'].outcome, 'rest_active') // terça com treino feito vira extra
  assert.equal(r.lastBreak, null)
})

t('compra com data futura conta no saldo mas não no estoque', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13')
  buy(s, '2026-10-20')
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.freezes, 0)
  assert.equal(r.balance, 70)
})

t('canBuyFreeze', () => {
  assert.deepEqual(S.canBuyFreeze({ balance: 30, freezes: 0 }), { ok: false, reason: 'coins', missing: 20 })
  assert.deepEqual(S.canBuyFreeze({ balance: 500, freezes: 2 }), { ok: false, reason: 'full' })
  assert.deepEqual(S.canBuyFreeze({ balance: 50, freezes: 1 }), { ok: true })
})

t('withFreezePurchase: valida saldo e estoque, inclusive em toques seguidos', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-09', ['2026-10-01']) // saldo 70 (7 dias, sem marco)
  const p = (id) => ({ id, date: TODAY, at: 1 })
  const a = S.withFreezePurchase(s, TODAY, p('a'))
  assert.equal(a.freezePurchases.length, 1)
  const b = S.withFreezePurchase(a, TODAY, p('b')) // saldo 20: bloqueia
  assert.equal(b, a)
  const rich = base()
  doneAll(rich, '2026-09-28', '2026-10-13') // saldo 120
  const r1 = S.withFreezePurchase(rich, TODAY, p('1'))
  const r2 = S.withFreezePurchase(r1, TODAY, p('2'))
  assert.equal(r2.freezePurchases.length, 2)
  assert.equal(S.withFreezePurchase(r2, TODAY, p('3')), r2) // estoque cheio
})

t('sanitizeFreezePurchases', () => {
  assert.deepEqual(S.sanitizeFreezePurchases('lixo'), [])
  const good = { id: 'a', date: '2026-10-01', at: 1 }
  assert.deepEqual(S.sanitizeFreezePurchases([good, { id: 'b', date: 'ontem', at: 1 }, null, { date: '2026-10-02' }]), [good])
})

t('streakEventText: dia cumprido, marco, extra e nada', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-12')
  const before = S.computeStreak(s, '2026-10-13')
  done(s, '2026-10-13')
  assert.equal(S.streakEventText(before, S.computeStreak(s, '2026-10-13')), '🔥 10 dias seguidos · +10 moedas')

  const m = base()
  doneAll(m, '2026-09-28', '2026-10-06') // 6 dias
  const m0 = S.computeStreak(m, '2026-10-08')
  done(m, '2026-10-08')
  assert.equal(S.streakEventText(m0, S.computeStreak(m, '2026-10-08')), '🏅 7 dias seguidos! +20 moedas de bônus')

  const e = base()
  doneAll(e, '2026-09-28', '2026-10-13')
  const e0 = S.computeStreak(e, TODAY)
  act(e, TODAY)
  assert.equal(S.streakEventText(e0, S.computeStreak(e, TODAY)), '+5 moedas · treino extra')
  assert.equal(S.streakEventText(e0, e0), null)
})

console.log(`\n${ok} testes OK${failed ? `, ${failed} FALHARAM` : ''}`)
await server.close()
process.exitCode = failed ? 1 : 0
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node tests/streak.test.mjs "$(pwd)"`
Expected: o Vite falha ao carregar `/src/domain/streak.ts` (arquivo inexistente) e o processo sai com erro.

- [ ] **Step 4: Implementar `src/domain/streak.ts`**

```ts
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

export type DayOutcome = 'kept' | 'frozen' | 'broken' | 'pending' | 'rest_active' | 'rest' | 'ignored'

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

function classify(state: GymState, date: string, plan: DayPlan, today: string): RawOutcome {
  if (plan.kind === 'before_start') return 'ignored'
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

export function computeStreak(state: GymState, today: string): StreakResult {
  const first = [state.startDate, ...Object.keys(state.history), ...Object.keys(state.activities)].filter((d) => d <= today).sort()[0] ?? today
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
 * resultado de antes com o de depois. Prioridade: marco > dia cumprido > extra. null = nada a comemorar.
 */
export function streakEventText(prev: StreakResult, next: StreakResult): string | null {
  const gained = Object.entries(next.days).filter(([d, r]) => r.coins > (prev.days[d]?.coins ?? 0))
  const milestone = gained.find(([d, r]) => r.milestone && prev.days[d]?.milestone !== r.milestone)?.[1].milestone
  if (milestone) return `🏅 ${daysLabel(milestone)}! +${MILESTONES[milestone]} moedas de bônus`
  if (gained.some(([, r]) => r.outcome === 'kept')) return `🔥 ${daysLabel(next.current)} · +${COINS_PER_DAY} moedas`
  if (gained.some(([, r]) => r.outcome === 'rest_active')) return `+${COINS_REST_EXTRA} moedas · treino extra`
  return null
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node tests/streak.test.mjs "$(pwd)"`
Expected: `19 testes OK` e código de saída 0.

- [ ] **Step 6: Tipos e lint**

Run: `npx tsc -b && npx oxlint`
Expected: nenhuma saída de erro.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/domain/streak.ts tests/streak.test.mjs
git commit -m "feat: cálculo da sequência, moedas e congelamentos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Store — validação das compras e ação `buyFreeze`

**Files:**
- Modify: `src/hooks/useGymStore.ts` (imports no topo, função `sanitize` perto da linha 82 e bloco de ações `/* ----- Check-in ----- */`)
- Test: `tests/streak.test.mjs` (acrescentar no fim, antes do `console.log` final)

**Interfaces:**
- Consumes: `sanitizeFreezePurchases(raw)` e `withFreezePurchase(state, today, purchase)` (Task 1); `uid()` de `src/utils.ts`.
- Produces: `store.buyFreeze(today: string): void`. A compra só é gravada se for permitida. `parseState` passa a limpar `freezePurchases`.

- [ ] **Step 1: Escrever o teste que deve falhar**

No `tests/streak.test.mjs`, logo depois de `const T = await server.ssrLoadModule('/src/data/templates.ts')`:

```js
const Store = await server.ssrLoadModule('/src/hooks/useGymStore.ts')
```

E, antes do `console.log` final:

```js
t('parseState limpa freezePurchases e aceita estado sem o campo', () => {
  const s = base()
  assert.equal(Store.parseState(JSON.parse(JSON.stringify(s))).freezePurchases, undefined)
  const good = { id: 'a', date: '2026-10-01', at: 1 }
  const parsed = Store.parseState({ ...JSON.parse(JSON.stringify(s)), freezePurchases: [good, { id: 2 }, 'x'] })
  assert.deepEqual(parsed.freezePurchases, [good])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tests/streak.test.mjs "$(pwd)"`
Expected: `FALHOU - parseState limpa freezePurchases...`, porque o `parseState` ainda mantém os itens inválidos.

- [ ] **Step 3: Implementar**

Em `src/hooks/useGymStore.ts`:

1. Junto dos outros imports de domínio:
   ```ts
   import { sanitizeFreezePurchases, withFreezePurchase } from '../domain/streak'
   ```
   Acrescentar `uid` ao import de `../utils`: `import { addDays, todayISO, uid, weekdayOf } from '../utils'`.
2. Em `sanitize`, trocar a linha
   ```ts
     const extras = state.checkins !== undefined ? { checkins: sanitizeCheckins(state.checkins) } : {}
   ```
   por
   ```ts
     const extras = {
       ...(state.checkins !== undefined && { checkins: sanitizeCheckins(state.checkins) }),
       ...(state.freezePurchases !== undefined && { freezePurchases: sanitizeFreezePurchases(state.freezePurchases) }),
     }
   ```
3. Logo depois da ação `saveCheckin` (antes de `/* ----- Geral ----- */`):
   ```ts
      /* ----- Gamificação ----- */

      /** Compra um congelamento hoje, se saldo e estoque permitirem (validado sobre o estado mais recente). */
      buyFreeze(today: string) {
        setState((s) => withFreezePurchase(s, today, { id: uid(), date: today, at: Date.now() }))
      },

   ```

- [ ] **Step 4: Rodar e ver passar**

Run: `node tests/streak.test.mjs "$(pwd)" && npx tsc -b && npx oxlint`
Expected: `20 testes OK` e nenhuma saída de erro do tsc/oxlint.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGymStore.ts tests/streak.test.mjs
git commit -m "feat: ação de comprar congelamento e validação das compras

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Card da sequência, loja e ❄ no calendário (aba Início)

**Files:**
- Create: `src/components/StreakCard.tsx`
- Modify: `src/views/HomeView.tsx` (props, topo do `HomeView` e `WeekCard`)
- Modify: `src/App.tsx` (calcular o `streak` e passar para o `HomeView`)

**Interfaces:**
- Consumes:
  - `StreakResult`, `canBuyFreeze`, `FREEZE_PRICE`, `MAX_FREEZES`, `MILESTONES`, `COINS_PER_DAY` e `COINS_REST_EXTRA` (Task 1).
  - `store.buyFreeze(today)` (Task 2).
  - `BottomSheet` (`src/components/BottomSheet.tsx`: props `open`, `title`, `onClose` e `children`) e `Button`
    (`src/components/ui.tsx`).
- Produces:
  - `StreakCard({ streak, purchases, onBuy }: { streak: StreakResult; purchases: FreezePurchase[]; onBuy: () => void })`.
  - `HomeView` passa a exigir a prop `streak: StreakResult`.

- [ ] **Step 1: Criar `src/components/StreakCard.tsx`**

```tsx
import { Coins, Flame, ShoppingBag, Snowflake } from 'lucide-react'
import { useState } from 'react'
import {
  canBuyFreeze,
  COINS_PER_DAY,
  COINS_REST_EXTRA,
  FREEZE_PRICE,
  MAX_FREEZES,
  MILESTONES,
  type StreakResult,
} from '../domain/streak'
import type { FreezePurchase } from '../types'
import { formatShortDate } from '../utils'
import { BottomSheet } from './BottomSheet'
import { Button } from './ui'

const TODAY_TEXT: Record<StreakResult['today'], string> = {
  kept: '✓ Sequência garantida hoje',
  pending: 'Treine hoje para manter a sequência',
  rest: 'Hoje é descanso',
  rest_active: `Hoje é descanso · +${COINS_REST_EXTRA} moedas pelo extra`,
}

const daysWord = (n: number) => (n === 1 ? 'dia' : 'dias')

/** Card da sequência (topo da aba Início) com o atalho para a loja de congelamentos. */
export function StreakCard({ streak, purchases, onBuy }: { streak: StreakResult; purchases: FreezePurchase[]; onBuy: () => void }) {
  const [shopOpen, setShopOpen] = useState(false)
  const m = streak.nextMilestone
  const on = streak.current > 0

  return (
    <section className="rounded-3xl border border-ink-800 bg-ink-900 p-4">
      <div className="flex items-center gap-3">
        <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${on ? 'bg-orange-400/15 text-orange-400' : 'bg-ink-800 text-ink-400'}`}>
          <Flame size={30} fill={on ? 'currentColor' : 'none'} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-3xl leading-none font-black tabular-nums">
            {streak.current}{' '}
            <span className="text-base font-bold text-ink-300">{streak.current === 1 ? 'dia seguido' : 'dias seguidos'}</span>
          </p>
          <p className="mt-1 text-[13px] text-ink-400">
            {streak.best > 0 ? `Melhor: ${streak.best} ${daysWord(streak.best)}` : 'Treine num dia proposto para começar sua sequência'}
          </p>
        </div>
      </div>

      <p
        className={`mt-3 text-[13px] font-semibold ${
          streak.today === 'kept' ? 'text-accent' : streak.today === 'pending' ? 'text-orange-400' : 'text-ink-300'
        }`}
      >
        {TODAY_TEXT[streak.today]}
      </p>
      {streak.lastBreak && (
        <p className="mt-1 text-[13px] text-ink-400">
          Sua sequência de {streak.lastBreak.length} {daysWord(streak.lastBreak.length)} acabou em {formatShortDate(streak.lastBreak.date)}.
        </p>
      )}

      {m && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between gap-2 text-[12px] text-ink-400">
            <span>Próximo marco: {m.at} dias</span>
            <span>
              faltam {m.remaining} · +{m.bonus} moedas
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-orange-400" style={{ width: `${(streak.current / m.at) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink-850 px-3 text-sm font-bold tabular-nums" aria-label={`${streak.balance} moedas`}>
          <Coins size={17} className="text-amber-400" /> {streak.balance}
        </span>
        <span
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink-850 px-3 text-sm font-bold tabular-nums"
          aria-label={`${streak.freezes} de ${MAX_FREEZES} congelamentos`}
        >
          <Snowflake size={17} className="text-sky-400" /> {streak.freezes}/{MAX_FREEZES}
        </span>
        <button
          type="button"
          onClick={() => setShopOpen(true)}
          className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl bg-lime px-4 text-sm font-bold text-on-accent transition active:scale-95"
        >
          <ShoppingBag size={17} /> Loja
        </button>
      </div>

      <ShopSheet open={shopOpen} streak={streak} purchases={purchases} onBuy={onBuy} onClose={() => setShopOpen(false)} />
    </section>
  )
}

function ShopSheet({
  open,
  streak,
  purchases,
  onBuy,
  onClose,
}: {
  open: boolean
  streak: StreakResult
  purchases: FreezePurchase[]
  onBuy: () => void
  onClose: () => void
}) {
  const check = canBuyFreeze(streak)
  const frozenDays = Object.keys(streak.days)
    .filter((d) => streak.days[d].outcome === 'frozen')
    .reverse()
    .slice(0, 5)
  const recent = [...purchases].sort((a, b) => b.at - a.at).slice(0, 5)
  const milestones = Object.entries(MILESTONES)
    .map(([at, bonus]) => `${at} (+${bonus})`)
    .join(', ')

  return (
    <BottomSheet open={open} title="Loja" onClose={onClose}>
      <div className="space-y-5">
        <p className="flex items-center gap-2 text-[15px] font-bold">
          <Coins size={18} className="text-amber-400" /> {streak.balance} moedas
        </p>

        <div>
          <div className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-850 p-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-sky-400/15 text-sky-400">
              <Snowflake size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">Congelamento</p>
              <p className="text-[13px] text-ink-400">
                Estoque: {streak.freezes}/{MAX_FREEZES}
              </p>
            </div>
            <Button onClick={onBuy} disabled={!check.ok} className="min-h-11 px-4">
              <Coins size={16} /> {FREEZE_PRICE}
            </Button>
          </div>
          {!check.ok && (
            <p className="mt-2 text-[13px] text-ink-400">
              {check.reason === 'full' ? `Estoque cheio (máx. ${MAX_FREEZES})` : `Faltam ${check.missing} moedas`}
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-ink-850 p-3 text-[13px] leading-relaxed text-ink-300">
          <p className="mb-1 font-bold text-ink-100">Como funciona</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Dia de treino cumprido (treino ou atividade no lugar dele): +1 na sequência e +{COINS_PER_DAY} moedas.</li>
            <li>Treino ou atividade num dia de descanso: +{COINS_REST_EXTRA} moedas.</li>
            <li>Bônus ao chegar a {milestones} dias seguidos.</li>
            <li>Faltou num dia de treino? Um congelamento é usado sozinho e a sequência continua. Sem congelamento, ela zera.</li>
            <li>O congelamento vale a partir do dia da compra: não salva uma falta que já passou.</li>
          </ul>
        </div>

        {(recent.length > 0 || frozenDays.length > 0) && (
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <p className="mb-1 font-semibold text-ink-300">Compras</p>
              {recent.length ? (
                recent.map((p) => (
                  <p key={p.id} className="text-ink-400">
                    {formatShortDate(p.date)}
                  </p>
                ))
              ) : (
                <p className="text-ink-600">—</p>
              )}
            </div>
            <div>
              <p className="mb-1 font-semibold text-ink-300">Usados em</p>
              {frozenDays.length ? (
                frozenDays.map((d) => (
                  <p key={d} className="text-ink-400">
                    {formatShortDate(d)}
                  </p>
                ))
              ) : (
                <p className="text-ink-600">—</p>
              )}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Ligar no `HomeView`**

Em `src/views/HomeView.tsx`:

1. Imports. Trocar `import { ChevronRight, Play } from 'lucide-react'` por
   `import { ChevronRight, Play, Snowflake } from 'lucide-react'` e acrescentar:
   ```ts
   import { StreakCard } from '../components/StreakCard'
   import type { StreakResult } from '../domain/streak'
   ```
2. No tipo `Props`, acrescentar `streak: StreakResult`.
3. No `HomeView`:
   - Assinatura: `export function HomeView({ store, today, streak, onGoToday, onOpenDay }: Props)`.
   - Logo depois do `</header>`:
     ```tsx
           <StreakCard streak={streak} purchases={state.freezePurchases ?? []} onBuy={() => store.buyFreeze(today)} />
     ```
   - Trocar `<WeekCard store={store} today={today} onGoToday={onGoToday} onOpenDay={onOpenDay} />` por
     `<WeekCard store={store} today={today} streak={streak} onGoToday={onGoToday} onOpenDay={onOpenDay} />`.
4. No `WeekCard`:
   - Assinatura: `function WeekCard({ store, today, streak, onGoToday, onOpenDay }: Props)`.
   - Dentro do `week.dates.map`, logo depois de `const plan = week.plans[d]`:
     ```tsx
               // Falta coberta por congelamento aparece com ❄ em vez do ✕.
               const frozen = streak.days[d]?.outcome === 'frozen'
     ```
   - No botão, trocar o `aria-label` por
     ``aria-label={`${WEEKDAYS_SHORT[i]}: ${relativeDayLabel(d, today)}${frozen ? ' · congelado' : ''}`}``.
   - Trocar o `<span>` da bolinha por:
     ```tsx
                     <span
                       className={`grid size-9 place-items-center rounded-full text-xs font-black ${frozen ? 'bg-sky-400/15 text-sky-300' : DOT[plan.kind]}`}
                     >
                       {frozen ? <Snowflake size={15} /> : dotLabel(plan, state.workouts)}
                     </span>
     ```

- [ ] **Step 3: Calcular o `streak` no `App`**

Em `src/App.tsx`:
1. Trocar `import { useCallback, useState } from 'react'` por `import { useCallback, useMemo, useState } from 'react'`
   e acrescentar `import { computeStreak } from './domain/streak'`.
2. Logo depois de `const rest = useRestTimer()`:
   ```ts
     // Sequência/moedas derivadas do histórico: recalcula quando o estado ou o dia mudam.
     const streak = useMemo(() => computeStreak(state, today), [state, today])
   ```
3. No `<HomeView ... />`, acrescentar a prop `streak={streak}`.

- [ ] **Step 4: Tipos, lint, build e testes**

Run: `npx tsc -b && npx oxlint && npm run build && node tests/streak.test.mjs "$(pwd)"`
Expected: build `✓ built` e `20 testes OK`.

- [ ] **Step 5: Commit**

```bash
git add src/components/StreakCard.tsx src/views/HomeView.tsx src/App.tsx
git commit -m "feat: card da sequência, loja de congelamentos e ❄ no calendário

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Selo 🔥 no topo e comemorações

**Files:**
- Create: `src/hooks/useStreakEvents.ts`
- Modify: `src/components/Navigation.tsx` (`StreakBadge` e `TopBar`)
- Modify: `src/App.tsx` (selo no topo do celular, `TopBar`, comemorações e `trackedStore`)

**Interfaces:**
- Consumes: `streakEventText(prev, next)` e `StreakResult` (Task 1); `vibrate(pattern)` de `src/feedback.ts`, que já
  respeita a preferência de vibração; `ToastMessage`/`setToast` do `App`.
- Produces:
  - `useStreakEvents(streak, onEvent): () => void`, que devolve `arm()`. Chamar `arm()` imediatamente antes de uma
    ação do usuário que pode render moedas.
  - `StreakBadge({ count, onClick })`.
  - A `TopBar` passa a receber `streak: number`.

- [ ] **Step 1: Criar `src/hooks/useStreakEvents.ts`**

```ts
import { useCallback, useEffect, useRef } from 'react'
import { streakEventText, type StreakResult } from '../domain/streak'

/** Tempo depois de uma ação do usuário em que uma mudança na sequência vira comemoração. */
const ARM_MS = 2000

/**
 * Comemora (via `onEvent`) só mudanças causadas por uma ação do usuário: abrir o app, virar o dia
 * ou receber dados da nuvem não disparam nada. Devolve `arm()`, para chamar antes da ação.
 */
export function useStreakEvents(streak: StreakResult, onEvent: (text: string) => void) {
  const prev = useRef(streak)
  const armedUntil = useRef(0)

  useEffect(() => {
    const before = prev.current
    prev.current = streak
    if (Date.now() > armedUntil.current) return
    const text = streakEventText(before, streak)
    if (!text) return
    armedUntil.current = 0
    onEvent(text)
  }, [streak, onEvent])

  return useCallback(() => {
    armedUntil.current = Date.now() + ARM_MS
  }, [])
}
```

- [ ] **Step 2: `StreakBadge` e `TopBar` em `src/components/Navigation.tsx`**

1. Import: `import { CalendarDays, ChartColumn, Dumbbell, Flame, House, Settings } from 'lucide-react'` já tem `Flame`.
   Não é preciso mudar nada.
2. Assinatura da `TopBar`: `export function TopBar({ tab, onChange, streak }: Props & { streak: number })`.
3. Na `TopBar`, dentro de `<div className="flex items-center gap-2">`, antes de
   `<SettingsButton tab={tab} onChange={onChange} />`:
   ```tsx
             <StreakBadge count={streak} onClick={() => onChange('home')} />
   ```
4. Antes de `export function Logo()`:
   ```tsx
   /** Selo da sequência (🔥 N) no topo; leva à aba Início. */
   export function StreakBadge({ count, onClick }: { count: number; onClick: () => void }) {
     return (
       <button
         type="button"
         onClick={onClick}
         aria-label={`Sequência: ${count} ${count === 1 ? 'dia' : 'dias'}`}
         className={`inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-black tabular-nums transition active:scale-95 ${
           count ? 'bg-orange-400/15 text-orange-400' : 'bg-ink-800 text-ink-400'
         }`}
       >
         <Flame size={17} fill={count ? 'currentColor' : 'none'} /> {count}
       </button>
     )
   }
   ```

- [ ] **Step 3: Ligar no `App`**

Em `src/App.tsx`:
1. Imports:
   - Trocar `import { BottomNav, Logo, SettingsButton, TopBar } from './components/Navigation'` por
     `import { BottomNav, Logo, SettingsButton, StreakBadge, TopBar } from './components/Navigation'`.
   - Acrescentar:
     ```ts
     import { vibrate } from './feedback'
     import type { GymStore } from './hooks/useGymStore'
     import { useStreakEvents } from './hooks/useStreakEvents'
     ```
2. Logo depois da linha `const streak = useMemo(...)` (criada no Task 3):
   ```ts
     const celebrate = useCallback((text: string) => {
       setToast({ id: Date.now(), text })
       vibrate([40, 60, 40])
     }, [])
     const armStreak = useStreakEvents(streak, celebrate)
     // Concluir treino pela aba Hoje é uma ação que pode render moedas: arma a comemoração antes.
     const trackedStore: GymStore = {
       ...store,
       completeSession: (date: string) => {
         armStreak()
         store.completeSession(date)
       },
     }
   ```
3. Em `saveActivity`, logo antes de `store.saveActivity(date, activity, today, previousDate)`, acrescentar `armStreak()`.
   O Toast de "Atividade registrada" é trocado pelo da comemoração quando houver uma.
4. No `<TodayView ... />`, trocar `store={store}` por `store={trackedStore}`.
5. Trocar `<TopBar tab={tab} onChange={changeTab} />` por `<TopBar tab={tab} onChange={changeTab} streak={streak.current} />`.
6. No topo do celular, trocar
   ```tsx
             <div className="-mr-2">
               <SettingsButton tab={tab} onChange={changeTab} />
             </div>
   ```
   por
   ```tsx
             <div className="-mr-2 flex items-center gap-1">
               <StreakBadge count={streak.current} onClick={() => changeTab('home')} />
               <SettingsButton tab={tab} onChange={changeTab} />
             </div>
   ```

- [ ] **Step 4: Tipos, lint, build e testes**

Run: `npx tsc -b && npx oxlint && npm run build && node tests/streak.test.mjs "$(pwd)"`
Expected: build OK e `20 testes OK`.

- [ ] **Step 5: Verificação manual no navegador**

Run: `npm run dev`, abrir a URL mostrada numa janela de 390 px e conferir:
1. Abrir a aba Hoje num dia de treino, confirmar uma série e concluir o treino. Deve aparecer o Toast
   "🔥 N dias seguidos · +10 moedas" e o selo do topo deve somar 1.
2. Recarregar a página: **nenhum** Toast de sequência aparece.
3. Registrar uma atividade "Extra" num dia de descanso (pelo botão "Cardio / Extra" da aba Semana): aparece
   "+5 moedas · treino extra".

- [ ] **Step 6: Review Focus 5 (dados da nuvem logo depois de uma ação)**

Com a sincronização ligada (Ajustes), concluir um treino e confirmar que aparece um único Toast de sequência. Uma
atualização vinda da nuvem logo depois, com o aviso "Dados atualizados com a versão da nuvem", não deve gerar um
segundo Toast de sequência. A janela de 2 s é consumida no primeiro evento (`armedUntil.current = 0`).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useStreakEvents.ts src/components/Navigation.tsx src/App.tsx
git commit -m "feat: selo da sequência no topo e comemorações

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verificação visual e checagem final

**Files:**
- Create (temporário, **não commitar**): `dist/__shots.html`

**Interfaces:**
- Consumes: o build de produção (`npm run build`) e a chave `gymduda:state` do localStorage.
- Produces: capturas para conferência. Nenhum arquivo do repo muda.

- [ ] **Step 1: Build e página de teste**

Run: `npm run build`. Depois criar `dist/__shots.html` com a ferramenta Write (o `build` apaga esse arquivo; crie
de novo depois de cada build):

```html
<!doctype html><html><body style="margin:0;background:#222;display:flex;gap:16px;padding:16px">
<iframe id="a" style="width:390px;height:1000px;border:0"></iframe>
<iframe id="b" style="width:390px;height:1000px;border:0"></iframe>
<iframe id="c" style="width:390px;height:1000px;border:0"></iframe>
<script>
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const load = (fr) => new Promise((r) => { fr.onload = () => setTimeout(r, 600); fr.src = '/' })
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
const wd = (s) => (new Date(s + 'T12:00').getDay() + 6) % 7
async function run() {
  localStorage.clear(); localStorage.setItem('gymduda:theme', 'dark')
  await load(a) // A: app novo, sem sequência
  const st = JSON.parse(localStorage.getItem('gymduda:state'))
  const w = st.workouts[0]
  st.startDate = day(-40); st.history = {}; st.activities = {}
  let skipped = false
  for (let i = 40; i >= 1; i--) {
    const d = day(-i)
    if (!st.trainingDays[wd(d)]) continue
    if (!skipped && i < 10) { skipped = true; continue } // uma falta recente, coberta por congelamento
    st.history[d] = { status: 'done', workoutId: w.id, workoutName: w.name, workoutColor: w.color, extra: false, startedAt: 0, finishedAt: 1, logs: {} }
  }
  st.freezePurchases = [{ id: 'f1', date: day(-30), at: 1 }]
  localStorage.setItem('gymduda:state', JSON.stringify(st))
  await load(b) // B: sequência longa com ❄ na semana (se a falta caiu nesta semana)
  await load(c)
  ;[...c.contentDocument.querySelectorAll('button')].find((x) => x.textContent.includes('Loja')).click()
  await wait(400) // C: loja aberta
}
run()
</script></body></html>
```

- [ ] **Step 2: Servir e capturar**

Run (Git Bash, na raiz do repo):
```bash
(npx vite preview --port 5195 --strictPort > /dev/null 2>&1 &) ; sleep 3
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --window-size=1250,1050 \
  --virtual-time-budget=8000 --screenshot="$(cygpath -w "$TEMP")\\streak.png" http://localhost:5195/__shots.html
```
Expected: `... bytes written to file ...\streak.png`. Abrir a imagem e conferir:
- **A:** card com "0 dias seguidos" e "Treine num dia proposto para começar sua sequência", e o selo 🔥 0 cinza.
- **B:** sequência > 0, barra até o próximo marco, moedas e ❄ x/2, e o selo laranja no topo.
- **C:** loja aberta, com o botão de compra habilitado ou com o motivo, e "Usados em" com a data da falta coberta.

Repetir com `localStorage.setItem('gymduda:theme', 'light')` no início do `run()` para conferir o tema claro.

- [ ] **Step 3: Limpeza**

Run (PowerShell):
```powershell
Remove-Item D:\GymDuda\GymDuda\dist\__shots.html -Confirm:$false
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*vite*preview*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
```

- [ ] **Step 4: Checagem final**

Run: `npx tsc -b && npx oxlint && npm run build && node tests/streak.test.mjs "$(pwd)" && git status --short`
Expected: tudo OK, `20 testes OK` e a árvore limpa (tudo commitado nos Tasks 1–4). **Não** fazer `git push`:
quem publica é o usuário.
