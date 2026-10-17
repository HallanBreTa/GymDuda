// Série de aproximação. Rodar: node tests/warmup.test.mjs "$(pwd)"
import { createServer } from 'vite'
import assert from 'node:assert/strict'

const server = await createServer({ root: process.argv[2], server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const S = await server.ssrLoadModule('/src/domain/sets.ts')
const Stats = await server.ssrLoadModule('/src/domain/stats.ts')
const E = await server.ssrLoadModule('/src/domain/exportLog.ts')
const I = await server.ssrLoadModule('/src/domain/importWorkouts.ts')
const T = await server.ssrLoadModule('/src/data/templates.ts')
let ok = 0
const t = (name, fn) => { fn(); ok++; console.log('OK -', name) }

const set = (load, reps, rir = '2') => ({ load, reps, rir, done: true })
const ex = { id: 'sup', name: 'Supino', sets: 2, reps: '8', load: '60kg', notes: '', warmup: true }
const session = (logs) => ({ status: 'done', workoutId: 'w', workoutName: 'A', workoutColor: 'lime', extra: false, startedAt: 0, finishedAt: 1, logs })

t('hasWarmup: só em exercícios de peso marcados', () => {
  assert.equal(S.hasWarmup(ex), true)
  assert.equal(S.hasWarmup({ ...ex, warmup: undefined }), false)
  assert.equal(S.hasWarmup({ ...ex, kind: 'time' }), false)
})

t('isWarmupValid: exige carga de 0 a 999', () => {
  assert.equal(S.isWarmupValid({ load: '20', done: false }), true)
  assert.equal(S.isWarmupValid({ load: '0', done: false }), true)
  assert.equal(S.isWarmupValid({ load: '', done: false }), false)
  assert.equal(S.isWarmupValid({ load: '1000', done: false }), false)
})

t('findPreviousWarmup e warmupFor: sugestão vem da última aproximação feita', () => {
  const sessions = S.doneSessionsDesc({
    '2026-10-10': session({ sup: { name: 'Supino', sets: [set('60', '8')], warmup: { load: '30', done: true } } }),
    '2026-10-12': session({ outro: { name: 'supino ', sets: [set('62', '8')] } }), // sem aproximação: pula
  })
  const prev = S.findPreviousWarmup(sessions, ex, '2026-10-14')
  assert.deepEqual(prev, { date: '2026-10-10', load: '30' })
  assert.deepEqual(S.warmupFor(undefined, ex, prev), { load: '30', done: false })
  assert.deepEqual(S.warmupFor(undefined, ex, null), { load: '', done: false })
  const current = session({ sup: { name: 'Supino', sets: [], warmup: { load: '35', done: true } } })
  assert.deepEqual(S.warmupFor(current, ex, prev), { load: '35', done: true })
})

t('aproximação fica fora de séries, volume, progresso e evolução', () => {
  const s = session({ sup: { name: 'Supino', sets: [set('60', '10')], warmup: { load: '30', done: true } } })
  const st = S.sessionStats(s)
  assert.equal(st.sets, 1)
  assert.equal(st.volume, 600)
  const w = { id: 'w', name: 'A', focus: '', color: 'lime', exercises: [ex] }
  assert.deepEqual(S.sessionProgress({ ...s, status: 'in_progress' }, w), { done: 1, total: 1 })
  const state = T.createInitialState()
  state.startDate = '2026-10-10'
  state.history = { '2026-10-10': s }
  const stats = Stats.computeStats(state, '2026-10-10', '2026-10-14')
  assert.equal(stats.sets, 1)
  assert.equal(stats.exercises[0].points[0].load, 60)
})

t('pruneUnconfirmed: guarda aproximação feita e descarta a não feita', () => {
  const logs = S.pruneUnconfirmed({
    a: { name: 'A', sets: [set('60', '8')], warmup: { load: '30', done: false } },
    b: { name: 'B', sets: [{ ...set('60', '8'), done: false }], warmup: { load: '30', done: true } },
    c: { name: 'C', sets: [{ ...set('60', '8'), done: false }] },
  })
  assert.deepEqual(logs.a, { name: 'A', sets: [set('60', '8')] })
  assert.deepEqual(logs.b, { name: 'B', sets: [], warmup: { load: '30', done: true } })
  assert.equal(logs.c, undefined)
})

t('export para IA: aproximação no histórico e no plano', () => {
  const state = T.createInitialState()
  state.startDate = '2026-10-10'
  state.workouts[0].exercises[0] = { ...state.workouts[0].exercises[0], warmup: true }
  const name = state.workouts[0].exercises[0].name
  state.history = { '2026-10-10': session({ x: { name: 'Supino', sets: [set('60', '8')], warmup: { load: '30', done: true } } }) }
  const md = E.buildTrainingLog(state, { from: null, today: '2026-10-14', withPrompt: false })
  assert.match(md, /- Supino: aproximação 30kg \| 60kg × 8 @2/)
  assert.ok(md.includes(`- ${name}: `) && md.includes('com série de aproximação'))
})

t('importação: "aproximacao": true liga a aproximação; ida e volta preserva', () => {
  const r = I.parseImport(JSON.stringify({ treinos: [{ nome: 'A', exercicios: [
    { nome: 'Supino', series: 3, repeticoes: '8', aproximacao: true },
    { nome: 'Prancha', tipo: 'tempo', series: 3, repeticoes: '45s', aproximacao: true },
    { nome: 'Rosca', series: 3, repeticoes: '10' },
  ] }] }))
  assert.ok(r.ok)
  const [sup, prancha, rosca] = r.plan.workouts[0].exercises
  assert.equal(sup.warmup, true)
  assert.equal(prancha.warmup, undefined)
  assert.equal(rosca.warmup, undefined)
  const state = T.createInitialState()
  state.workouts = r.plan.workouts
  state.queue = state.workouts.map((w) => w.id)
  const back = JSON.parse(I.currentPlanJson(state))
  assert.equal(back.treinos[0].exercicios[0].aproximacao, true)
  assert.equal(back.treinos[0].exercicios[2].aproximacao, undefined)
})

console.log(`\n${ok} testes OK`)
await server.close()
