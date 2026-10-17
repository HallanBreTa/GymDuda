import { ChartColumn, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { fmt, fmtCompact } from '../chartScale'
import { BarList, ChartCard, ColumnChart, LineChart, type Column } from '../components/charts'
import { EmptyState } from '../components/ui'
import { ACTIVITY_META } from '../data/activityTypes'
import { formatDuration } from '../domain/activities'
import { average, checkinValues, moodMeta, painLabel, painTone } from '../domain/checkins'
import { formatSet } from '../domain/sets'
import { computeStats, firstDataDate, type Stats } from '../domain/stats'
import type { GymState, Mood } from '../types'
import { addDays, diffDays, formatShortDate, weekdayOf, WEEKDAYS, WEEKDAYS_SHORT } from '../utils'

const PERIODS: { days: number | null; label: string }[] = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: null, label: 'Todos' },
]

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0)

const WEEKDAYS_PLURAL = ['às segundas', 'às terças', 'às quartas', 'às quintas', 'às sextas', 'aos sábados', 'aos domingos']

/** "às segundas", "às terças e aos sábados"… */
function weekdayList(indices: number[]) {
  const names = indices.map((i) => WEEKDAYS_PLURAL[i])
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0]
}

const argmax = (values: number[]) => {
  const max = Math.max(...values)
  return max > 0 ? values.flatMap((v, i) => (v === max ? [i] : [])) : []
}

export function StatsView({ state, today }: { state: GymState; today: string }) {
  const [days, setDays] = useState<number | null>(90)
  const stats = useMemo(() => {
    const from = days ? addDays(today, -(days - 1)) : firstDataDate(state, today)
    return computeStats(state, from, today)
  }, [state, today, days])

  const hasData = stats.sessions > 0 || stats.planned > 0 || stats.activityMin > 0

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-ink-400">
          {days ? `Últimos ${stats.days} dias` : `Desde ${formatShortDate(stats.from)}`}
        </p>
        <h1 className="text-3xl font-black tracking-tight">Seus dados</h1>
      </header>

      <CheckinWeek state={state} today={today} />

      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Período">
        {PERIODS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setDays(p.days)}
            aria-pressed={days === p.days}
            className={`h-10 rounded-xl text-sm font-semibold transition ${
              days === p.days ? 'bg-lime text-on-accent' : 'bg-ink-900 text-ink-300 hover:bg-ink-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <EmptyState
          icon={<ChartColumn size={24} />}
          title="Ainda sem dados"
          text="Conclua alguns treinos e os gráficos aparecem aqui: frequência, faltas, volume e evolução de carga."
        />
      ) : (
        <>
          <Kpis stats={stats} />
          <CardioSection stats={stats} />
          <WeekdayCharts stats={stats} />
          <ExerciseProgress stats={stats} />
          <Rankings stats={stats} />
        </>
      )}
    </div>
  )
}

/* ---------- Disposição e dor (últimos 7 dias, fora do filtro de período) ---------- */

/** Média dos últimos 7 dias e tendência contra os 7 anteriores (diferença ≥ 0,5). */
function weekAverage(state: GymState, field: 'mood' | 'backPain', today: string) {
  const avg = average(checkinValues(state, field, today, 7))
  const prev = average(checkinValues(state, field, addDays(today, -7), 7))
  const delta = avg !== null && prev !== null && Math.abs(avg - prev) >= 0.5 ? avg - prev : 0
  // Disposição: subir é melhorar. Dor: descer é melhorar.
  const better = field === 'mood' ? delta > 0 : delta < 0
  return { avg, prev, trend: delta === 0 ? null : better ? ('better' as const) : ('worse' as const), up: delta > 0 }
}

function CheckinWeek({ state, today }: { state: GymState; today: string }) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  if (!dates.some((d) => state.checkins?.[d])) return null
  const mood = weekAverage(state, 'mood', today)
  const pain = weekAverage(state, 'backPain', today)

  const tiles = [
    {
      label: 'Disposição média',
      value: mood.avg !== null ? `${fmt(mood.avg)}/5` : '—',
      detail: mood.avg !== null ? moodMeta(Math.min(5, Math.max(1, Math.round(mood.avg))) as Mood).label : 'sem registro',
      tone: 'text-ink-100',
      ...mood,
    },
    {
      label: 'Dor na coluna média',
      value: pain.avg !== null ? `${fmt(pain.avg)}/10` : '—',
      detail: pain.avg !== null ? painLabel(Math.round(pain.avg)) : 'sem registro',
      tone: pain.avg !== null ? painTone(Math.round(pain.avg)).text : '',
      ...pain,
    },
  ]

  return (
    <ChartCard
      title="Como você está"
      subtitle="Últimos 7 dias · disposição e dor na coluna"
      table={{
        head: ['Dia', 'Disposição', 'Dor', 'Obs.'],
        rows: dates.map((d) => {
          const c = state.checkins?.[d]
          return [
            `${WEEKDAYS_SHORT[weekdayOf(d)]} ${formatShortDate(d)}`,
            c?.mood ? `${c.mood} · ${moodMeta(c.mood).label}` : '—',
            c?.backPain ?? '—',
            c?.note.trim() || '—',
          ]
        }),
      }}
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-ink-850 p-3">
            <p className="text-[12px] font-semibold text-ink-400">{t.label}</p>
            <p className={`mt-0.5 text-xl font-black tracking-tight tabular-nums ${t.tone}`}>{t.value}</p>
            <p className="text-[12px] text-ink-400">
              {t.detail}
              {t.trend && ` · antes ${fmt(t.prev!)}`}
            </p>
            {t.trend && (
              <p className={`mt-1 inline-flex items-center gap-1 text-[12px] font-semibold ${t.trend === 'better' ? 'text-accent' : 'text-red-400'}`}>
                {t.up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {t.trend === 'better' ? 'melhorando' : 'piorando'}
              </p>
            )}
          </div>
        ))}
      </div>
      <ul className="grid grid-cols-7 gap-1">
        {dates.map((d) => {
          const c = state.checkins?.[d]
          const Mood = c?.mood ? moodMeta(c.mood).icon : null
          const p = c?.backPain ?? null
          return (
            <li
              key={d}
              className={`flex flex-col items-center gap-1.5 rounded-xl py-2 ${d === today ? 'bg-ink-850 ring-1 ring-lime/40' : ''}`}
              title={c?.note || undefined}
            >
              <span className="text-[11px] font-semibold text-ink-400">{WEEKDAYS_SHORT[weekdayOf(d)]}</span>
              <span className="grid h-6 place-items-center text-ink-300">{Mood ? <Mood size={20} /> : <span className="text-ink-600">–</span>}</span>
              <span
                className={`grid size-8 place-items-center rounded-lg text-sm font-bold tabular-nums ${
                  p !== null ? `${painTone(p).soft} ${painTone(p).text}` : 'text-ink-600'
                }`}
              >
                {p ?? '–'}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[12px] text-ink-400">Rostinho = disposição · número = dor na coluna (0–10).</p>
    </ChartCard>
  )
}

/* ---------- Números principais ---------- */

function Kpis({ stats }: { stats: Stats }) {
  const tiles = [
    { label: 'Treinos', value: fmt(stats.sessions), detail: stats.extras ? `${stats.extras} fora dos dias planejados` : `${fmt(stats.sessions / Math.max(1, stats.days / 7))} por semana` },
    { label: 'Comparecimento', value: `${pct(stats.attended, stats.planned)}%`, detail: `${stats.attended} de ${stats.planned} dias planejados` },
    { label: 'Faltas', value: fmt(stats.missed), detail: stats.missed ? 'dias de treino sem registro' : 'nenhuma no período' },
    { label: 'Volume', value: `${fmtCompact(stats.volume)} kg`, detail: `${fmt(stats.sets)} séries concluídas` },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
          <p className="text-[13px] font-semibold text-ink-400">{t.label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight">{t.value}</p>
          <p className="mt-0.5 text-[12px] text-ink-400">{t.detail}</p>
        </div>
      ))}
    </div>
  )
}

/* ---------- Cardio e treinos trocados ---------- */

function CardioSection({ stats }: { stats: Stats }) {
  const { cardio, replaced } = stats
  if (!cardio.count && !replaced.count) return null
  const weekly = stats.bucketUnit === 'week'
  const unit = weekly ? 'semana' : 'mês'
  const periodLabel = (b: Stats['buckets'][number]) =>
    `${weekly ? `Semana de ${formatShortDate(b.start)}` : b.label}${b.current ? ' (em andamento)' : ''}`
  const perWeek = cardio.minutes / Math.max(1, stats.days / 7)
  const trainingDays = stats.planned // já inclui os dias substituídos

  const tiles = [
    {
      label: 'Cardio feito',
      value: formatDuration(cardio.minutes),
      detail: cardio.count
        ? `${cardio.count} ${cardio.count === 1 ? 'sessão' : 'sessões'}${cardio.km ? ` · ${fmt(cardio.km)} km` : ''} · ~${formatDuration(Math.round(perWeek))}/semana`
        : 'nenhum no período',
    },
    {
      label: 'Treinos trocados',
      value: fmt(replaced.count),
      detail: replaced.count
        ? `${replaced.byCardio === replaced.count ? 'todos' : replaced.byCardio} por cardio${trainingDays ? ` · ${pct(replaced.count, trainingDays)}% dos dias de treino` : ''}`
        : 'nenhuma troca no período',
    },
  ]

  const columns: Column[] = stats.buckets.map((b) => ({
    label: b.label,
    value: b.cardioMin,
    tipValue: `${formatDuration(b.cardioMin)}${b.replaced ? ` · ${b.replaced} ${b.replaced === 1 ? 'troca' : 'trocas'}` : ''}`,
    tipLabel: periodLabel(b),
  }))

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
            <p className="text-[13px] font-semibold text-ink-400">{t.label}</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-coral">{t.value}</p>
            <p className="mt-0.5 text-[12px] text-ink-400">{t.detail}</p>
          </div>
        ))}
      </div>
      {cardio.count > 0 && (
        <ChartCard
          title={`Cardio por ${unit}`}
          subtitle="Caminhada, corrida, bike, natação e cardio geral"
          table={{
            head: [weekly ? 'Semana' : 'Mês', 'Cardio', 'Treinos trocados'],
            rows: stats.buckets.map((b) => [periodLabel(b), b.cardioMin ? formatDuration(b.cardioMin) : '—', b.replaced || '—']),
          }}
        >
          <ColumnChart columns={columns} tone="coral" labelEvery={Math.ceil(stats.buckets.length / 8)} format={(n) => formatDuration(Math.round(n))} />
        </ChartCard>
      )}
    </div>
  )
}

/* ---------- Dias da semana ---------- */

function WeekdayCharts({ stats }: { stats: Stats }) {
  const { weekdays } = stats
  const topDone = argmax(weekdays.map((w) => w.done))
  const topMissed = argmax(weekdays.map((w) => w.missed))

  const doneColumns: Column[] = weekdays.map((w, i) => ({
    label: WEEKDAYS_SHORT[i],
    value: w.done,
    emphasis: topDone.includes(i),
    tipValue: `${w.done} ${w.done === 1 ? 'treino' : 'treinos'}`,
    tipLabel: w.planned ? `${WEEKDAYS[i]} · ${pct(w.attended, w.planned)}% de comparecimento` : `${WEEKDAYS[i]} · fora dos dias planejados`,
  }))
  const missedColumns: Column[] = weekdays.map((w, i) => ({
    label: WEEKDAYS_SHORT[i],
    value: w.missed,
    emphasis: topMissed.includes(i),
    tipValue: `${w.missed} ${w.missed === 1 ? 'falta' : 'faltas'}`,
    tipLabel: w.planned ? `${WEEKDAYS[i]} · de ${w.planned} dias planejados` : `${WEEKDAYS[i]} · não é dia de treino`,
  }))

  const table = {
    head: ['Dia', 'Treinos', 'Planejados', 'Compareceu', 'Faltas'],
    rows: weekdays.map((w, i) => [WEEKDAYS[i], w.done, w.planned, w.planned ? `${pct(w.attended, w.planned)}%` : '—', w.missed]),
  }

  const worst = topMissed[0]
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ChartCard
        title="Treinos por dia da semana"
        subtitle={topDone.length ? `Você treina mais ${weekdayList(topDone)}` : 'Nenhum treino no período'}
        table={table}
      >
        <ColumnChart columns={doneColumns} />
      </ChartCard>
      <ChartCard
        title="Faltas por dia da semana"
        subtitle={
          topMissed.length
            ? `Você falta mais ${weekdayList(topMissed)} (${pct(weekdays[worst].missed, weekdays[worst].planned)}% das vezes)`
            : 'Nenhuma falta no período'
        }
        table={table}
      >
        <ColumnChart columns={missedColumns} tone="coral" />
      </ChartCard>
    </div>
  )
}

/* ---------- Evolução por exercício ---------- */

function ExerciseProgress({ stats }: { stats: Stats }) {
  const [selected, setSelected] = useState('')
  if (!stats.exercises.length) return null
  const exercise = stats.exercises.find((e) => e.name === selected) ?? stats.exercises[0]
  const { points } = exercise
  const first = points[0]
  const last = points[points.length - 1]
  const delta = last.load - first.load

  const linePoints = points.map((p) => ({
    x: diffDays(stats.from, p.date),
    y: p.load,
    label: formatShortDate(p.date),
    tipValue: formatSet(p.set),
    tipLabel: `${formatShortDate(p.date)} · 1RM est. ${fmt(p.e1rm)} kg`,
  }))

  return (
    <ChartCard
      title="Evolução por exercício"
      subtitle={
        points.length > 1
          ? `Melhor série: ${delta > 0 ? '+' : ''}${fmt(delta)} kg desde ${formatShortDate(first.date)}`
          : 'Só uma sessão no período'
      }
      table={{
        head: ['Data', 'Melhor série', '1RM est. (kg)'],
        rows: points.map((p) => [formatShortDate(p.date), formatSet(p.set), fmt(p.e1rm)]),
      }}
    >
      <select
        value={exercise.name}
        onChange={(e) => setSelected(e.target.value)}
        aria-label="Exercício"
        className="mb-4 h-11 w-full rounded-xl border border-ink-700 bg-ink-850 px-3 text-sm text-ink-100 outline-none focus:border-lime/70"
      >
        {stats.exercises.map((e) => (
          <option key={e.name} value={e.name}>
            {e.name} ({e.points.length} {e.points.length === 1 ? 'sessão' : 'sessões'})
          </option>
        ))}
      </select>
      <LineChart points={linePoints} format={(n) => `${fmt(n)}`} />
      <p className="mt-2 text-[12px] text-ink-400">Carga (kg) da melhor série de cada sessão.</p>
    </ChartCard>
  )
}

/* ---------- Rankings ---------- */

function Rankings({ stats }: { stats: Stats }) {
  if (!stats.byWorkout.length && !stats.byActivity.length) return null
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {stats.byWorkout.length > 0 && (
        <ChartCard
          title="Treinos mais feitos"
          table={{ head: ['Treino', 'Vezes'], rows: stats.byWorkout.map((w) => [w.name, w.count]) }}
        >
          <BarList rows={stats.byWorkout.map((w) => ({ label: w.name, value: w.count, display: `${w.count}×` }))} />
        </ChartCard>
      )}
      {stats.byActivity.length > 0 && (
        <ChartCard
          title="Atividades avulsas"
          subtitle={`${formatDuration(stats.activityMin)} no total`}
          table={{
            head: ['Atividade', 'Vezes', 'Tempo'],
            rows: stats.byActivity.map((a) => [ACTIVITY_META[a.type].label, a.count, formatDuration(a.minutes)]),
          }}
        >
          <BarList
            rows={stats.byActivity.map((a) => ({
              label: ACTIVITY_META[a.type].label,
              value: a.minutes,
              display: `${formatDuration(a.minutes)} · ${a.count}×`,
            }))}
          />
        </ChartCard>
      )}
    </div>
  )
}
