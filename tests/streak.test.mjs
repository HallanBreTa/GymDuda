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

t('falta sem congelamento zera; lastBreak some depois de um dia cumprido', () => {
  const s = base()
  doneAll(s, '2026-09-28', '2026-10-13', ['2026-10-06'])
  const r = S.computeStreak(s, TODAY)
  assert.equal(r.days['2026-10-06'].outcome, 'broken')
  assert.equal(r.current, 4)
  assert.equal(r.best, 5)
  assert.equal(r.earned, 90)
  assert.equal(r.lastBreak, null) // houve dias cumpridos depois da quebra
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
