import { ChevronRight, Play, Snowflake } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { StreakCard } from '../components/StreakCard'
import { TextArea, WorkoutBadge } from '../components/ui'
import { MOODS, painLabel, painTone, weekProgress } from '../domain/checkins'
import { nextPlannedDay, type DayPlan } from '../domain/queue'
import type { StreakResult } from '../domain/streak'
import type { GymStore } from '../hooks/useGymStore'
import type { CheckIn } from '../types'
import { addDays, formatLongDate, relativeDayLabel, WEEKDAYS_SHORT, workoutBadge } from '../utils'

type Props = {
  store: GymStore
  today: string
  streak: StreakResult
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

export function HomeView({ store, today, streak, onGoToday, onOpenDay }: Props) {
  const { state } = store
  const checkin = state.checkins?.[today]
  const yesterday = state.checkins?.[addDays(today, -1)]

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-ink-400 first-letter:uppercase">{formatLongDate(today)}</p>
        <h1 className="text-3xl font-black tracking-tight">Olá!</h1>
      </header>

      <StreakCard streak={streak} purchases={state.freezePurchases ?? []} onBuy={() => store.buyFreeze(today)} />

      {/* key: o rascunho da nota recomeça quando o dia vira */}
      <CheckinCard
        key={today}
        checkin={checkin}
        yesterdayPain={yesterday?.backPain ?? null}
        onChange={(patch) => store.saveCheckin(today, patch)}
      />

      <WeekCard store={store} today={today} streak={streak} onGoToday={onGoToday} onOpenDay={onOpenDay} />
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

/* ---------- Esta semana ---------- */

function WeekCard({ store, today, streak, onGoToday, onOpenDay }: Props) {
  const { state } = store
  const week = useMemo(() => weekProgress(state, today), [state, today])
  const todayPlan = week.plans[today]
  const next = useMemo(() => nextPlannedDay(state, today, today), [state, today])
  const nextWorkout = next ? state.workouts.find((w) => w.id === next.workoutId) : undefined
  const inProgress = todayPlan?.kind === 'in_progress' ? todayPlan.session : null

  return (
    <Card title="Esta semana" hint={`${week.done} ${week.done === 1 ? 'treino feito' : 'treinos feitos'}`}>
      <ul className="grid grid-cols-7 gap-1">
        {week.dates.map((d, i) => {
          const plan = week.plans[d]
          // Falta coberta por congelamento aparece com ❄ em vez do ✕.
          const frozen = streak.days[d]?.outcome === 'frozen'
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                aria-label={`${WEEKDAYS_SHORT[i]}: ${relativeDayLabel(d, today)}${frozen ? ' · congelado' : ''}`}
                className="flex w-full flex-col items-center gap-1 py-1 transition active:scale-95"
              >
                <span className={`text-[11px] font-semibold ${d === today ? 'text-accent' : 'text-ink-400'}`}>{WEEKDAYS_SHORT[i]}</span>
                <span
                  className={`grid size-9 place-items-center rounded-full text-xs font-black ${frozen ? 'bg-sky-400/15 text-sky-300' : DOT[plan.kind]}`}
                >
                  {frozen ? <Snowflake size={15} /> : dotLabel(plan, state.workouts)}
                </span>
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
