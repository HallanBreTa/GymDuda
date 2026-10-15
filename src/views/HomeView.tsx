import { ChevronRight, Minus, Play, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { TextArea, WorkoutBadge } from '../components/ui'
import { average, moodMeta, MOODS, painLabel, painTone, painValues, weekProgress } from '../domain/checkins'
import { nextPlannedDay, type DayPlan } from '../domain/queue'
import type { GymStore } from '../hooks/useGymStore'
import type { CheckIn } from '../types'
import { addDays, formatLongDate, relativeDayLabel, weekdayOf, WEEKDAYS_SHORT, workoutBadge } from '../utils'

type Props = {
  store: GymStore
  today: string
  /** Vai para a aba Hoje no dia de hoje. */
  onGoToday: () => void
  onOpenDay: (date: string) => void
}

const PAIN_SCALE = Array.from({ length: 11 }, (_, i) => i)

/** Cor da bolinha de cada dia na visão da semana (mesmas cores dos status da aba Semana). */
const DOT: Record<DayPlan['kind'], string> = {
  done: 'bg-lime text-on-accent',
  in_progress: 'bg-amber-400/20 text-amber-300 ring-2 ring-amber-400/60',
  pending: 'bg-ink-800 text-ink-100 ring-2 ring-lime',
  planned: 'bg-ink-800 text-ink-300',
  missed: 'bg-red-500/15 text-red-400',
  rest_logged: 'bg-sky-400/12 text-sky-300',
  replaced: 'bg-coral/15 text-coral',
  rest: 'bg-ink-900 text-ink-600',
  before_start: 'bg-ink-900 text-ink-600',
}

export function HomeView({ store, today, onGoToday, onOpenDay }: Props) {
  const { state } = store
  const checkin = state.checkins?.[today]
  const yesterday = state.checkins?.[addDays(today, -1)]

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-ink-400 first-letter:uppercase">{formatLongDate(today)}</p>
        <h1 className="text-3xl font-black tracking-tight">Olá!</h1>
      </header>

      {/* key: o rascunho da nota recomeça quando o dia vira */}
      <CheckinCard
        key={today}
        checkin={checkin}
        yesterdayPain={yesterday?.backPain ?? null}
        onChange={(patch) => store.saveCheckin(today, patch)}
      />

      <LastDays store={store} today={today} />

      <WeekCard store={store} today={today} onGoToday={onGoToday} onOpenDay={onOpenDay} />
    </div>
  )
}

/* ---------- Check-in do dia ---------- */

function CheckinCard({
  checkin,
  yesterdayPain,
  onChange,
}: {
  checkin: CheckIn | undefined
  yesterdayPain: number | null
  onChange: (patch: Partial<Omit<CheckIn, 'updatedAt'>>) => void
}) {
  const mood = checkin?.mood ?? null
  const pain = checkin?.backPain ?? null
  const [note, setNote] = useState(checkin?.note ?? '')

  return (
    <Card title="Como você está hoje?" hint={checkin ? 'Salvo' : 'Toque para registrar'}>
      <p className="mb-2 text-[13px] font-semibold text-ink-300">Disposição</p>
      <div role="radiogroup" aria-label="Disposição" className="grid grid-cols-5 gap-1.5">
        {MOODS.map(({ value, label, icon: Icon }) => {
          const on = mood === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ mood: on ? null : value })}
              className={`flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition active:scale-95 ${
                on ? 'bg-lime text-on-accent' : 'bg-ink-850 text-ink-400 hover:bg-ink-800'
              }`}
            >
              <Icon size={24} strokeWidth={on ? 2.5 : 2} />
              {label}
            </button>
          )
        })}
      </div>

      <div className="mt-5 mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink-300">Dor na coluna</p>
        {pain !== null ? (
          <p className={`text-[13px] font-bold ${painTone(pain).text}`}>
            {pain}/10 · {painLabel(pain)}
          </p>
        ) : (
          <p className="text-xs text-ink-400">0 = sem dor · 10 = máxima</p>
        )}
      </div>
      <div role="radiogroup" aria-label="Dor na coluna, de 0 a 10" className="grid grid-cols-6 gap-1.5">
        {PAIN_SCALE.map((n) => {
          const on = pain === n
          const tone = painTone(n)
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`Dor ${n}: ${painLabel(n)}`}
              onClick={() => onChange({ backPain: on ? null : n })}
              className={`h-11 rounded-xl text-[15px] font-bold tabular-nums transition active:scale-95 ${
                on ? tone.solid : `${tone.soft} ${tone.text} hover:brightness-125`
              }`}
            >
              {n}
            </button>
          )
        })}
      </div>
      {pain !== null && yesterdayPain !== null && (
        <p className="mt-2 text-[13px] text-ink-400">
          Ontem: dor {yesterdayPain} → hoje {pain}
          {pain < yesterdayPain ? ' · melhorou' : pain > yesterdayPain ? ' · piorou' : ' · igual'}
        </p>
      )}

      <label className="mt-5 block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-300">Observação (opcional)</span>
        <TextArea
          value={note}
          placeholder="Ex.: dormi mal, dor ao sentar, travou ao abaixar…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== (checkin?.note ?? '')) onChange({ note })
          }}
        />
      </label>
    </Card>
  )
}

/* ---------- Últimos 7 dias ---------- */

function LastDays({ store, today }: { store: GymStore; today: string }) {
  const { state } = store
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const avg = average(painValues(state, today, 7))
  const prevAvg = average(painValues(state, addDays(today, -7), 7))
  const trend = avg !== null && prevAvg !== null && Math.abs(avg - prevAvg) >= 0.5 ? (avg < prevAvg ? 'down' : 'up') : null
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

  if (!dates.some((d) => state.checkins?.[d])) return null

  return (
    <Card title="Últimos 7 dias" hint="Disposição e dor na coluna">
      <ul className="grid grid-cols-7 gap-1">
        {dates.map((d) => {
          const c = state.checkins?.[d]
          const Mood = c?.mood ? moodMeta(c.mood).icon : null
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
                  c?.backPain !== null && c?.backPain !== undefined ? `${painTone(c.backPain).soft} ${painTone(c.backPain).text}` : 'text-ink-600'
                }`}
              >
                {c?.backPain ?? '–'}
              </span>
            </li>
          )
        })}
      </ul>
      {avg !== null && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ink-400">
          Dor média: <strong className={painTone(Math.round(avg)).text}>{fmt(avg)}/10</strong>
          {trend === 'down' && (
            <span className="inline-flex items-center gap-1 text-accent">
              <TrendingDown size={15} /> melhorando
            </span>
          )}
          {trend === 'up' && (
            <span className="inline-flex items-center gap-1 text-red-400">
              <TrendingUp size={15} /> piorando
            </span>
          )}
          {trend && prevAvg !== null && <span>(antes: {fmt(prevAvg)})</span>}
        </p>
      )}
    </Card>
  )
}

/* ---------- Esta semana ---------- */

function WeekCard({ store, today, onGoToday, onOpenDay }: Props) {
  const { state } = store
  const week = useMemo(() => weekProgress(state, today), [state, today])
  const { goal, done, remaining, daysLeft } = week
  const todayPlan = week.plans[today]
  const next = useMemo(() => nextPlannedDay(state, today, today), [state, today])
  const nextWorkout = next ? state.workouts.find((w) => w.id === next.workoutId) : undefined
  const inProgress = todayPlan?.kind === 'in_progress' ? todayPlan.session : null

  const message =
    remaining === 0
      ? 'Meta da semana batida! 🎉'
      : remaining > daysLeft
        ? `Faltam ${remaining}, mas só restam ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} na semana`
        : `${remaining === 1 ? 'Falta 1 dia' : `Faltam ${remaining} dias`} para a meta`

  return (
    <Card title="Esta semana" hint={`${done}/${goal} ${goal === 1 ? 'dia' : 'dias'}`}>
      <div className="flex items-center gap-3 rounded-2xl bg-ink-850 p-3">
        <p className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">
          Vou conseguir ir
          <span className="block text-xs font-normal text-ink-400">
            {week.isDefaultGoal ? 'padrão (dias de treino)' : (
              <button type="button" className="font-semibold text-accent underline-offset-2 hover:underline" onClick={() => store.setWeekGoal(week.weekStart, null)}>
                voltar ao padrão
              </button>
            )}
          </span>
        </p>
        <StepButton label="Menos um dia" disabled={goal <= 1} onClick={() => store.setWeekGoal(week.weekStart, goal - 1)}>
          <Minus size={18} />
        </StepButton>
        <p className="w-14 text-center leading-none" aria-live="polite">
          <span className="text-3xl font-black tabular-nums">{goal}</span>
          <span className="block text-[11px] font-semibold text-ink-400">{goal === 1 ? 'dia' : 'dias'}</span>
        </p>
        <StepButton label="Mais um dia" disabled={goal >= 7} onClick={() => store.setWeekGoal(week.weekStart, goal + 1)}>
          <Plus size={18} />
        </StepButton>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
          <span className="font-semibold">{message}</span>
          <span className="font-bold text-accent tabular-nums">
            {done}/{goal}
          </span>
        </div>
        <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(done, goal)} aria-label="Dias feitos na semana">
          {Array.from({ length: Math.max(goal, done) }, (_, i) => (
            <span key={i} className={`h-2.5 flex-1 rounded-full ${i < done ? 'bg-lime' : 'bg-ink-800'}`} />
          ))}
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-7 gap-1">
        {week.dates.map((d, i) => {
          const plan = week.plans[d]
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                aria-label={`${WEEKDAYS_SHORT[i]}: ${relativeDayLabel(d, today)}`}
                className="flex w-full flex-col items-center gap-1 py-1 transition active:scale-95"
              >
                <span className={`text-[11px] font-semibold ${d === today ? 'text-accent' : 'text-ink-400'}`}>{WEEKDAYS_SHORT[i]}</span>
                <span className={`grid size-9 place-items-center rounded-full text-xs font-black ${DOT[plan.kind]}`}>{dotLabel(plan, state.workouts)}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {(inProgress || nextWorkout) && (
        <button
          type="button"
          onClick={() => (inProgress || next?.date === today ? onGoToday() : onOpenDay(next!.date))}
          className="mt-4 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-lime/40 bg-lime/6 p-3 text-left transition active:scale-[0.99]"
        >
          {inProgress ? (
            <WorkoutBadge name={inProgress.workoutName} color={inProgress.workoutColor} size="sm" />
          ) : (
            nextWorkout && <WorkoutBadge name={nextWorkout.name} color={nextWorkout.color} size="sm" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-black tracking-wider text-accent uppercase">
              {inProgress ? 'Em andamento' : `Próximo treino · ${relativeDayLabel(next!.date, today)}`}
            </span>
            <span className="block truncate text-[15px] font-semibold">{inProgress?.workoutName ?? nextWorkout?.name}</span>
          </span>
          {inProgress || next?.date === today ? (
            <span className="grid size-10 place-items-center rounded-full bg-lime text-on-accent">
              <Play size={18} fill="currentColor" />
            </span>
          ) : (
            <ChevronRight size={18} className="text-ink-400" />
          )}
        </button>
      )}
    </Card>
  )
}

/** Letra do treino (feito/previsto), ✓/–/✕ nos demais. */
function dotLabel(plan: DayPlan, workouts: { id: string; name: string }[]) {
  switch (plan.kind) {
    case 'done':
    case 'in_progress':
      return workoutBadge(plan.session.workoutName)
    case 'pending':
    case 'planned': {
      const w = workouts.find((x) => x.id === plan.workoutId)
      return w ? workoutBadge(w.name) : ''
    }
    case 'missed':
      return '✕'
    case 'replaced':
      return '↔'
    default:
      return ''
  }
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink-800 text-ink-100 transition hover:bg-ink-700 active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-ink-800 bg-ink-900 p-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <span className="text-xs text-ink-400">{hint}</span>}
      </div>
      {children}
    </section>
  )
}
