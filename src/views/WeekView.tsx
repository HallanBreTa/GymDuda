import { ArrowDown, ArrowRightLeft, ArrowUp, Check, ChevronRight, Info, Minus, Moon, Plus, X } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { ActivityBadge } from '../components/ActivityCard'
import { WorkoutBadge } from '../components/ui'
import { ACTIVITY_META } from '../data/activityTypes'
import { formatDuration, totalMinutes } from '../domain/activities'
import { projectDays, type DayPlan } from '../domain/queue'
import type { GymStore } from '../hooks/useGymStore'
import type { Activity, Workout } from '../types'
import { addDays, formatShortDate, startOfWeek, WEEKDAYS, WEEKDAYS_SHORT } from '../utils'

type Props = {
  store: GymStore
  today: string
  onOpenDay: (date: string) => void
  onAddActivity: (date: string) => void
}

const STATUS: Record<DayPlan['kind'], { label: string; className: string }> = {
  done: { label: 'Feito', className: 'bg-lime/15 text-accent' },
  in_progress: { label: 'Em andamento', className: 'bg-amber-400/15 text-amber-300' },
  pending: { label: 'Hoje', className: 'bg-lime text-on-accent' },
  planned: { label: 'Previsto', className: 'bg-ink-800 text-ink-300' },
  missed: { label: 'Falta', className: 'bg-red-500/15 text-red-400' },
  rest_logged: { label: 'Descansou', className: 'bg-sky-400/12 text-sky-300' },
  replaced: { label: 'Substituído', className: 'bg-coral/15 text-coral' },
  rest: { label: 'Descanso', className: 'text-ink-400' },
  before_start: { label: '—', className: 'text-ink-600' },
}

export function WeekView({ store, today, onOpenDay, onAddActivity }: Props) {
  const { state } = store
  const weekStart = startOfWeek(today)
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const plans = useMemo(() => projectDays(state, dates, today), [state, dates, today])
  const workoutsById = useMemo(() => new Map(state.workouts.map((w) => [w.id, w])), [state.workouts])

  const queueWorkouts = state.queue.map((id) => workoutsById.get(id)).filter((w): w is Workout => !!w)
  const loose = state.workouts.filter((w) => !state.queue.includes(w.id))
  const daysPerWeek = state.trainingDays.filter(Boolean).length
  const doneThisWeek = dates.filter((d) => plans[d].kind === 'done').length
  const trainingSlotsThisWeek = dates.filter((d) =>
    ['done', 'in_progress', 'pending', 'planned', 'missed', 'replaced'].includes(plans[d].kind),
  ).length
  const activityMinutes = totalMinutes(state, dates)

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-medium text-ink-400">Fila de treinos e dias da semana</p>
        <h1 className="text-3xl font-black tracking-tight">Planejamento</h1>
      </header>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={`${doneThisWeek}/${trainingSlotsThisWeek}`} label="feitos na semana" accent />
        <Stat value={daysPerWeek} label="dias/semana" />
        <Stat value={formatDuration(activityMinutes)} label="de cardio/extra" coral />
      </div>

      <button
        type="button"
        onClick={() => onAddActivity(today)}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-coral/50 bg-coral/6 text-[15px] font-semibold text-coral transition hover:bg-coral/12 active:scale-[0.99]"
      >
        <Plus size={18} strokeWidth={2.5} /> Atividade extra / Cardio
      </button>

      {/* ----- Semana atual (realizado + projeção) ----- */}
      <Section title="Esta semana" hint="Toque para abrir o dia">
        <ul className="space-y-2">
          {dates.map((date, i) => (
            <li key={date}>
              <DayRow
                label={WEEKDAYS_SHORT[i]}
                date={date}
                isToday={date === today}
                plan={plans[date]}
                workoutsById={workoutsById}
                activities={state.activities[date] ?? []}
                onClick={() => onOpenDay(date)}
              />
            </li>
          ))}
        </ul>
      </Section>

      {/* ----- Dias de treino ----- */}
      <Section title="Dias de treino" hint={`${daysPerWeek} por semana`}>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS_SHORT.map((label, i) => {
            const on = state.trainingDays[i]
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                aria-label={`${WEEKDAYS[i]}: ${on ? 'dia de treino' : 'descanso'}`}
                onClick={() => store.setTrainingDay(i, !on)}
                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold transition active:scale-95 ${
                  on ? 'bg-lime text-on-accent' : 'bg-ink-900 text-ink-400 hover:bg-ink-800'
                }`}
              >
                {label}
                {on ? <Check size={14} strokeWidth={3} /> : <Moon size={13} />}
              </button>
            )
          })}
        </div>
        <Tip>
          Os dias definem <strong>quando</strong> você treina; a fila define <strong>qual</strong> treino. Faltou? O treino espera o próximo dia.
          Treinou num dia de descanso? A fila anda e a semana seguinte se ajusta sozinha.
        </Tip>
      </Section>

      {/* ----- Ordem da fila ----- */}
      <Section title="Ordem da fila" hint="Toque para definir o próximo">
        {queueWorkouts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink-700 p-5 text-center text-sm text-ink-400">
            A fila está vazia. Adicione treinos abaixo ou crie novos na aba Treinos.
          </p>
        ) : (
          <ol className="space-y-2">
            {queueWorkouts.map((w, i) => {
              const isNext = i === state.pointer
              return (
                <li
                  key={w.id}
                  className={`flex items-center gap-2 rounded-2xl border p-2 pl-3 ${isNext ? 'border-lime/50 bg-lime/6' : 'border-ink-800 bg-ink-900'}`}
                >
                  <button
                    type="button"
                    onClick={() => store.setNextWorkout(w.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
                    aria-label={`Definir ${w.name} como próximo`}
                  >
                    <span className="w-4 text-center text-sm font-bold text-ink-400 tabular-nums">{i + 1}</span>
                    <WorkoutBadge name={w.name} color={w.color} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{w.name}</span>
                      {isNext && <span className="text-[11px] font-black tracking-wider text-accent uppercase">Próximo</span>}
                    </span>
                  </button>
                  <IconButton label="Mover para cima" disabled={i === 0} onClick={() => store.moveInQueue(i, -1)}>
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton label="Mover para baixo" disabled={i === queueWorkouts.length - 1} onClick={() => store.moveInQueue(i, 1)}>
                    <ArrowDown size={16} />
                  </IconButton>
                  <IconButton label={`Tirar ${w.name} da fila`} onClick={() => store.removeFromQueue(w.id)} danger>
                    <X size={16} />
                  </IconButton>
                </li>
              )
            })}
          </ol>
        )}

        {loose.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-semibold text-ink-400">Fora da fila (avulsos)</p>
            <ul className="space-y-2">
              {loose.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => store.addToQueue(w.id)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-ink-700 p-2 pl-3 text-left transition hover:border-lime/50"
                  >
                    <WorkoutBadge name={w.name} color={w.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink-300">{w.name}</span>
                    <span className="grid size-10 place-items-center text-accent">
                      <Plus size={18} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  )
}

function DayRow({
  label,
  date,
  isToday,
  plan,
  workoutsById,
  activities,
  onClick,
}: {
  label: string
  date: string
  isToday: boolean
  plan: DayPlan
  workoutsById: Map<string, Workout>
  activities: Activity[]
  onClick: () => void
}) {
  const id =
    plan.kind === 'pending' || plan.kind === 'planned'
      ? plan.workoutId
      : plan.kind === 'done' || plan.kind === 'in_progress'
        ? plan.session.workoutId
        : null
  const snapshot = plan.kind === 'done' || plan.kind === 'in_progress' ? plan.session : null
  const w = id ? workoutsById.get(id) : undefined
  const name = w?.name ?? snapshot?.workoutName
  const color = w?.color ?? snapshot?.workoutColor
  // A atividade que substituiu o treino já aparece como o "conteúdo" do dia.
  const extras = activities.filter((a) => a.mode === 'extra')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3 pl-4 text-left transition active:scale-[0.99] ${
        isToday ? 'border-lime/40 bg-ink-900' : 'border-ink-800 bg-ink-900 hover:border-ink-700'
      }`}
    >
      <div className="w-12 shrink-0 self-start pt-1">
        <p className="font-bold">{label}</p>
        <p className="text-xs text-ink-400">{formatShortDate(date)}</p>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-3">
          {plan.kind === 'replaced' ? (
            <>
              <ActivityBadge type={plan.activity.type} size="sm" />
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                {ACTIVITY_META[plan.activity.type].short} · {formatDuration(plan.activity.durationMin)}
              </p>
            </>
          ) : name && color ? (
            <>
              <WorkoutBadge name={name} color={color} size="sm" />
              <p className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${plan.kind === 'planned' ? 'text-ink-300' : ''}`}>{name}</p>
            </>
          ) : (
            <>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-800 text-ink-400">
                {plan.kind === 'missed' ? <X size={15} /> : plan.kind === 'before_start' ? <Minus size={15} /> : <Moon size={15} />}
              </span>
              <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink-400">
                {plan.kind === 'missed' ? 'Treino não registrado' : plan.kind === 'before_start' ? 'Sem registro' : 'Descanso'}
              </p>
            </>
          )}
        </div>

        {extras.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {extras.map((a) => {
              const Icon = ACTIVITY_META[a.type].icon
              return (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-coral/12 py-0.5 pr-2 pl-1.5 text-[11px] font-semibold text-coral">
                  <Icon size={12} strokeWidth={2.5} />
                  {ACTIVITY_META[a.type].short} · {formatDuration(a.durationMin)}
                </span>
              )
            })}
          </div>
        )}
      </div>

      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[plan.kind].className}`}>
        {plan.kind === 'replaced' && <ArrowRightLeft size={11} />}
        {STATUS[plan.kind].label}
      </span>
      <ChevronRight size={16} className="shrink-0 text-ink-600" />
    </button>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <span className="text-xs text-ink-400">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Stat({ value, label, accent, coral }: { value: ReactNode; label: string; accent?: boolean; coral?: boolean }) {
  return (
    <div className="rounded-2xl bg-ink-900 px-3 py-3.5">
      <p className={`text-2xl font-black tabular-nums ${accent ? 'text-accent' : coral ? 'text-coral' : ''}`}>{value}</p>
      <p className="text-xs text-ink-400">{label}</p>
    </div>
  )
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex gap-2 rounded-xl bg-ink-900 p-3 text-[13px] leading-relaxed text-ink-300">
      <Info size={16} className="mt-0.5 shrink-0 text-sky-400" />
      <span>{children}</span>
    </p>
  )
}

function IconButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-10 shrink-0 place-items-center rounded-xl transition disabled:opacity-20 ${
        danger ? 'text-ink-400 hover:bg-red-500/15 hover:text-red-400' : 'text-ink-300 hover:bg-ink-800'
      }`}
    >
      {children}
    </button>
  )
}
