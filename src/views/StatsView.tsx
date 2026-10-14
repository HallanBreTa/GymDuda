import { ChartColumn } from 'lucide-react'
import { useMemo, useState } from 'react'
import { fmt, fmtCompact } from '../chartScale'
import { BarList, ChartCard, ColumnChart, LineChart, type Column } from '../components/charts'
import { EmptyState } from '../components/ui'
import { ACTIVITY_META } from '../data/activityTypes'
import { formatDuration } from '../domain/activities'
import { formatSet } from '../domain/sets'
import { computeStats, firstDataDate, type Stats } from '../domain/stats'
import type { GymState } from '../types'
import { addDays, diffDays, formatShortDate, WEEKDAYS, WEEKDAYS_SHORT } from '../utils'

const PERIODS: { days: number | null; label: string }[] = [
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 182, label: '6 meses' },
  { days: null, label: 'Tudo' },
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

      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Período">
        {PERIODS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setDays(p.days)}
            aria-pressed={days === p.days}
            className={`h-10 rounded-xl text-sm font-semibold transition ${
              days === p.days ? 'bg-lime text-ink-950' : 'bg-ink-900 text-ink-300 hover:bg-ink-800'
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
          <WeekdayCharts stats={stats} />
          <TimeCharts stats={stats} />
          <ExerciseProgress stats={stats} />
          <Rankings stats={stats} />
        </>
      )}
    </div>
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

/* ---------- Ao longo do tempo ---------- */

function TimeCharts({ stats }: { stats: Stats }) {
  const weekly = stats.bucketUnit === 'week'
  const unit = weekly ? 'semana' : 'mês'
  const periodLabel = (b: Stats['buckets'][number]) =>
    `${weekly ? `Semana de ${formatShortDate(b.start)}` : b.label}${b.current ? ' (em andamento)' : ''}`
  const labelEvery = Math.ceil(stats.buckets.length / 8)

  const sessionColumns: Column[] = stats.buckets.map((b) => ({
    label: b.label,
    value: b.sessions,
    tipValue: `${b.sessions} ${b.sessions === 1 ? 'treino' : 'treinos'}`,
    tipLabel: periodLabel(b),
  }))
  const volumeColumns: Column[] = stats.buckets.map((b) => ({
    label: b.label,
    value: b.volume,
    tipValue: `${fmt(b.volume, 0)} kg`,
    tipLabel: periodLabel(b),
  }))

  const fullWeeks = stats.buckets.filter((b) => !b.current)
  const hitGoal = weekly ? fullWeeks.filter((b) => b.sessions >= stats.plannedPerWeek).length : 0
  const table = {
    head: [weekly ? 'Semana' : 'Mês', 'Treinos', 'Volume (kg)', 'Atividades'],
    rows: stats.buckets.map((b) => [periodLabel(b), b.sessions, fmt(b.volume, 0), b.activityMin ? formatDuration(b.activityMin) : '—']),
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ChartCard
        title={`Treinos por ${unit}`}
        subtitle={
          weekly && stats.plannedPerWeek && fullWeeks.length
            ? `Bateu a meta de ${stats.plannedPerWeek} em ${hitGoal} de ${fullWeeks.length} semanas`
            : `Total de ${stats.sessions} treinos`
        }
        table={table}
      >
        <ColumnChart
          columns={sessionColumns}
          labelEvery={labelEvery}
          reference={weekly && stats.plannedPerWeek ? { value: stats.plannedPerWeek, label: `meta ${stats.plannedPerWeek}` } : undefined}
        />
      </ChartCard>
      <ChartCard title={`Volume por ${unit}`} subtitle="Carga × repetições das séries concluídas (kg)" table={table}>
        <ColumnChart columns={volumeColumns} labelEvery={labelEvery} format={fmtCompact} />
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
