import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  Dumbbell,
  Flag,
  History,
  Moon,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  Trophy,
  Zap,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { ActivityCard } from '../components/ActivityCard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DayStrip } from '../components/DayStrip'
import { ExerciseLogCard } from '../components/ExerciseLogCard'
import { Button, EmptyState, WorkoutBadge } from '../components/ui'
import { WorkoutPicker } from '../components/WorkoutPicker'
import {
  isTrainingDay,
  missedSinceLastWorkout,
  nextPlannedDay,
  nextWorkoutId,
  projectDays,
  staleSession,
} from '../domain/queue'
import { doneSessionsDesc, findPrevious, sessionProgress, sessionStats, setsFor, type SetField } from '../domain/sets'
import type { GymStore } from '../hooks/useGymStore'
import { ACTIVITY_META } from '../data/activityTypes'
import { formatDuration } from '../domain/activities'
import type { Activity, Exercise, Workout, WorkoutColor, WorkoutSession } from '../types'
import { addDays, COLOR_STYLES, formatLongDate, formatShortDate, relativeDayLabel, startOfWeek, WEEKDAYS, weekdayOf } from '../utils'

type Props = {
  store: GymStore
  today: string
  selectedDate: string
  onSelectDate: (date: string) => void
  onEditWorkout: (workout: Workout) => void
  onAddActivity: (date: string) => void
  onEditActivity: (date: string, activity: Activity) => void
  /** Id da atividade recém-salva (anima o card). */
  highlightActivityId?: string
}

type Dialog = { kind: 'complete' } | { kind: 'discard'; date: string } | { kind: 'rest' } | { kind: 'swap'; workoutId: string } | null
type NextInfo = { date: string; workoutId: string } | null

/** A sessão tem algo digitado/confirmado? (decide se trocar/descansar pede confirmação) */
const hasData = (session?: WorkoutSession) =>
  !!session && Object.values(session.logs).some((l) => l.sets.some((s) => s.done || s.load || s.reps || s.rir))

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function TodayView({
  store,
  today,
  selectedDate,
  onSelectDate,
  onEditWorkout,
  onAddActivity,
  onEditActivity,
  highlightActivityId,
}: Props) {
  const { state } = store
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)

  const weekStart = startOfWeek(selectedDate)
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const plans = useMemo(() => projectDays(state, weekDates, today), [state, weekDates, today])
  const workoutsById = useMemo(() => new Map(state.workouts.map((w) => [w.id, w])), [state.workouts])
  const sessionsDesc = useMemo(() => doneSessionsDesc(state.history), [state.history])

  const date = selectedDate
  const isToday = date === today
  const plan = plans[date]
  const nextId = nextWorkoutId(state)
  const missed = isToday ? missedSinceLastWorkout(state, today) : []
  const stale = isToday ? staleSession(state, today) : null
  const upcoming: NextInfo = isToday ? nextPlannedDay(state, addDays(today, 1), today) : null
  const activities = state.activities[date] ?? []
  const canLogActivity = date <= today

  const session = plan.kind === 'in_progress' || plan.kind === 'done' ? plan.session : undefined
  const workoutId = plan.kind === 'pending' || plan.kind === 'planned' ? plan.workoutId : session?.workoutId
  const workout = workoutId ? workoutsById.get(workoutId) : undefined
  const editable = (plan.kind === 'pending' || plan.kind === 'in_progress') && !!workout
  const progress = editable && workout ? sessionProgress(session, workout) : null

  const nameOf = (id: string | null | undefined) => (id && workoutsById.get(id)?.name) || 'próximo treino'
  const dayLabel = relativeDayLabel(date, today)
  // "ontem" ou "07 out" — soa natural em "treino de …" / "feito …"
  const pastDay = dayLabel === 'ontem' ? 'ontem' : formatShortDate(date)
  const pastWhen = dayLabel === 'ontem' ? 'ontem' : `em ${pastDay}`

  // Dia passado sem treino registrado: dá para registrar retroativamente (esqueceu de marcar).
  const canLogPast =
    date < today &&
    state.workouts.length > 0 &&
    (plan.kind === 'missed' || plan.kind === 'rest' || plan.kind === 'rest_logged' || plan.kind === 'before_start')
  const logPastButton = canLogPast && (
    <Button
      variant={plan.kind === 'missed' || plan.kind === 'before_start' ? 'primary' : 'secondary'}
      className="mt-6"
      onClick={() => setPickerOpen(true)}
    >
      <History size={18} /> Registrar treino feito {pastWhen}
    </Button>
  )

  /* ----- Ações ----- */

  const pickWorkout = (id: string) => {
    if (session?.status === 'in_progress' && id !== session.workoutId && hasData(session)) setDialog({ kind: 'swap', workoutId: id })
    else store.startSession(date, id)
  }

  const registerRest = () => {
    if (session?.status === 'in_progress' && hasData(session)) setDialog({ kind: 'rest' })
    else store.logRest(date)
  }

  const finish = () => {
    if (!progress || progress.done === 0) return
    if (progress.done < progress.total) setDialog({ kind: 'complete' })
    else store.completeSession(date)
  }

  const exerciseHandlers = (exercise: Exercise, w: Workout) => ({
    onUpdate: (i: number, field: SetField, value: string) => store.updateSet(date, w.id, exercise, i, { [field]: value }),
    onToggle: (i: number, done: boolean) => store.setSetDone(date, w.id, exercise, i, done),
    onAddSet: () => store.addSet(date, w.id, exercise),
    onRemoveSet: (i: number) => store.removeSet(date, w.id, exercise, i),
    onFillPrevious: () => {
      const prev = findPrevious(sessionsDesc, exercise, date)
      if (prev) store.fillFromPrevious(date, w.id, exercise, prev.sets)
    },
  })

  /* ----- Render ----- */

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-400 first-letter:uppercase">{formatLongDate(date)}</p>
          <h1 className="text-3xl font-black tracking-tight">{isToday ? 'Hoje' : capitalize(relativeDayLabel(date, today))}</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          {!isToday && (
            <button
              type="button"
              onClick={() => onSelectDate(today)}
              className="h-10 rounded-full bg-lime/12 px-4 text-sm font-semibold text-accent transition hover:bg-lime/20"
            >
              Hoje
            </button>
          )}
          {canLogActivity && (
            <button
              type="button"
              onClick={() => onAddActivity(date)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-coral/15 pr-4 pl-3 text-sm font-semibold text-coral transition hover:bg-coral/25 active:scale-95"
            >
              <Plus size={17} strokeWidth={2.5} /> Cardio / Extra
            </button>
          )}
        </div>
      </header>

      <DayStrip
        weekStart={weekStart}
        today={today}
        selectedDate={date}
        plans={plans}
        workoutsById={workoutsById}
        activities={state.activities}
        onSelect={onSelectDate}
      />

      {/* ----- Avisos ----- */}
      {stale && (
        <Banner icon={<CalendarClock size={18} />}>
          <p>
            {stale.session.retroactive ? 'O registro do ' : 'O '}
            <strong>{stale.session.workoutName}</strong> de {relativeDayLabel(stale.date, today)}{' '}
            {stale.session.retroactive ? 'não foi salvo.' : 'ficou em andamento.'}
          </p>
          <div className="mt-2 flex gap-2">
            <BannerButton onClick={() => onSelectDate(stale.date)}>Continuar</BannerButton>
            <BannerButton onClick={() => setDialog({ kind: 'discard', date: stale.date })}>Descartar</BannerButton>
          </div>
        </Banner>
      )}

      {missed.length > 0 && !stale && (plan.kind === 'pending' || plan.kind === 'rest') && (
        <Banner icon={<AlertTriangle size={18} />}>
          {missed.length === 1 ? 'Sem treino registrado ' : `${missed.length} treinos perdidos: `}
          <strong>{missed.map((d) => relativeDayLabel(d, today)).join(', ')}</strong>. A fila foi mantida —{' '}
          {plan.kind === 'pending' ? (
            <>
              hoje é o <strong>{nameOf(nextId)}</strong>.
            </>
          ) : (
            <>
              o <strong>{nameOf(nextId)}</strong> continua sendo o próximo.
            </>
          )}
          <div className="mt-2">
            <BannerButton onClick={() => onSelectDate(missed[missed.length - 1])}>
              Treinei {relativeDayLabel(missed[missed.length - 1], today)}, registrar
            </BannerButton>
          </div>
        </Banner>
      )}

      {/* ----- Atividades avulsas do dia ----- */}
      {activities.length > 0 && (
        <section aria-label="Atividades avulsas" className="space-y-2">
          {activities.map((a) => (
            <ActivityCard key={a.id} activity={a} highlight={a.id === highlightActivityId} onClick={() => onEditActivity(date, a)} />
          ))}
        </section>
      )}

      {/* ----- Treino editável (hoje ou sessão pendente de dia anterior) ----- */}
      {editable && workout && progress && (
        <>
          <Hero
            name={workout.name}
            focus={workout.focus}
            color={workout.color}
            label={
              plan.kind === 'in_progress'
                ? session?.retroactive
                  ? `Registro de ${pastDay}`
                  : plan.stale
                  ? `Iniciado ${dayLabel}`
                  : session?.extra
                    ? 'Treino extra'
                    : 'Em andamento'
                : 'Próximo da fila'
            }
            labelIcon={session?.retroactive ? <History size={12} /> : session?.extra ? <Zap size={12} /> : undefined}
          >
            {session?.retroactive && (
              <p className="mb-4 text-[13px] text-ink-300">
                Preencha o que você fez {pastWhen} e salve. Se era o próximo da fila, a fila anda normalmente.
              </p>
            )}
            <ProgressBar done={progress.done} total={progress.total} color={workout.color} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip icon={<Repeat size={15} />} label="Trocar" onClick={() => setPickerOpen(true)} />
              <Chip icon={<Pencil size={15} />} label="Editar" onClick={() => onEditWorkout(workout)} />
              {plan.kind === 'pending' && <Chip icon={<Moon size={15} />} label="Descansar" onClick={registerRest} />}
              {plan.kind === 'in_progress' && (
                <Chip icon={<Trash2 size={15} />} label="Descartar" onClick={() => setDialog({ kind: 'discard', date })} />
              )}
            </div>
          </Hero>

          {workout.exercises.length === 0 ? (
            <EmptyState
              icon={<Dumbbell size={24} />}
              title="Treino sem exercícios"
              text="Adicione exercícios para registrar as séries."
              action={<Button onClick={() => onEditWorkout(workout)}>Adicionar exercícios</Button>}
            />
          ) : (
            <div className="space-y-3">
              {workout.exercises.map((exercise, i) => (
                <ExerciseLogCard
                  key={exercise.id}
                  index={i}
                  exercise={exercise}
                  sets={setsFor(session, exercise)}
                  previous={findPrevious(sessionsDesc, exercise, date)}
                  mode="edit"
                  {...exerciseHandlers(exercise, workout)}
                />
              ))}
            </div>
          )}

          {/* Barra fixa de concluir (fica acima da navegação inferior no celular) */}
          <div className="h-20" />
          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-ink-800/80 bg-ink-950/90 backdrop-blur-xl md:bottom-0">
            <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
              <Button className="w-full" disabled={progress.done === 0} onClick={finish}>
                <Flag size={18} />
                {progress.done === 0
                  ? 'Confirme ao menos 1 série'
                  : `${session?.retroactive ? `Salvar treino de ${pastDay}` : 'Concluir treino'} · ${progress.done}/${progress.total} séries`}
              </Button>
            </div>
          </div>
        </>
      )}

      {plan.kind === 'in_progress' && !workout && (
        <EmptyState
          icon={<AlertTriangle size={24} />}
          title="Treino não encontrado"
          text="O treino desta sessão foi excluído."
          action={
            <Button variant="secondary" onClick={() => store.clearDay(date)}>
              Descartar sessão
            </Button>
          }
        />
      )}

      {plan.kind === 'done' && (
        <DoneSection
          session={plan.session}
          focus={workout?.focus ?? ''}
          isToday={isToday}
          nextLabel={upcoming ? `Próximo: ${nameOf(upcoming.workoutId)} · ${relativeDayLabel(upcoming.date, today)}` : 'Bom descanso.'}
          onReopen={() => store.reopenSession(date)}
        />
      )}

      {plan.kind === 'planned' && workout && (
        <>
          <Hero name={workout.name} focus={workout.focus} color={workout.color} label="Previsto pela fila" muted>
            <p className="text-[13px] text-ink-300">Previsão: muda sozinha se você faltar ou fizer um treino extra antes desse dia.</p>
          </Hero>
          <div className="space-y-3">
            {workout.exercises.map((exercise, i) => (
              <ExerciseLogCard
                key={exercise.id}
                index={i}
                exercise={exercise}
                sets={[]}
                previous={findPrevious(sessionsDesc, exercise, date)}
                mode="readonly"
              />
            ))}
          </div>
        </>
      )}

      {plan.kind === 'rest' && (
        <StatusCard
          icon={<Moon size={28} />}
          iconClass="text-sky-300"
          title={date < today ? 'Descanso' : 'Dia de descanso'}
          text={
            date < today
              ? 'Dia sem treino planejado.'
              : isToday && nextId
                ? `Quer treinar mesmo assim? Isso puxa o ${nameOf(nextId)} para hoje e a fila segue a partir dele.`
                : 'Músculo cresce na recuperação. Hidrate-se e durma bem.'
          }
        >
          {isToday && nextId && (
            <div className="mt-6 flex flex-col gap-2">
              <Button variant="secondary" onClick={() => store.startSession(date, nextId)}>
                <Zap size={18} /> Treinar mesmo assim
              </Button>
              <Button variant="ghost" className="text-coral hover:text-coral" onClick={() => onAddActivity(date)}>
                <Plus size={18} /> Registrar cardio / atividade
              </Button>
            </div>
          )}
          {isToday && !nextId && <p className="mt-4 text-sm text-ink-400">Sua fila está vazia. Crie treinos na aba Treinos.</p>}
          {logPastButton}
        </StatusCard>
      )}

      {plan.kind === 'rest_logged' && (
        <StatusCard
          icon={<Moon size={28} />}
          iconClass="text-sky-300"
          title="Descanso registrado"
          text={
            isToday && isTrainingDay(state, date) && upcoming
              ? `O ${nameOf(upcoming.workoutId)} foi adiado para ${relativeDayLabel(upcoming.date, today)} (${formatShortDate(upcoming.date)}).`
              : 'A fila não andou neste dia.'
          }
        >
          {isToday && (
            <Button variant="secondary" className="mt-6" onClick={() => store.clearDay(date)}>
              <RotateCcw size={18} /> Desfazer
            </Button>
          )}
          {logPastButton}
        </StatusCard>
      )}

      {plan.kind === 'replaced' && (
        <StatusCard
          icon={<ArrowRightLeft size={28} />}
          iconClass="text-coral"
          title="Treino substituído"
          text={`${ACTIVITY_META[plan.activity.type].label} (${formatDuration(plan.activity.durationMin)}) no lugar da musculação. ${
            isToday && upcoming
              ? `O ${nameOf(upcoming.workoutId)} rolou para ${relativeDayLabel(upcoming.date, today)} (${formatShortDate(upcoming.date)}).`
              : 'O treino previsto seguiu para o próximo dia de treino.'
          }`}
        >
          <Button variant="secondary" className="mt-6" onClick={() => store.setActivityMode(date, plan.activity.id, 'extra', today)}>
            <RotateCcw size={18} /> Desfazer substituição
          </Button>
        </StatusCard>
      )}

      {plan.kind === 'missed' && (
        <StatusCard
          icon={<AlertTriangle size={28} />}
          iconClass="text-amber-400"
          title="Treino não registrado"
          text={`Era dia de treino (${WEEKDAYS[weekdayOf(date)].toLowerCase()}) e nada foi registrado. Nenhum treino foi pulado: o que estava previsto passou para o dia de treino seguinte. Treinou e esqueceu de marcar? Registre abaixo.`}
        >
          {logPastButton}
        </StatusCard>
      )}

      {plan.kind === 'before_start' && (
        <StatusCard
          icon={<CalendarClock size={28} />}
          iconClass="text-ink-400"
          title="Antes do início da fila"
          text="Sua fila começou depois deste dia. Treinou nele? Registre o treino e a fila passa a contar a partir daqui."
        >
          {logPastButton}
        </StatusCard>
      )}

      {/* ----- Sheets e diálogos ----- */}
      {pickerOpen && (
        <WorkoutPicker
          title={`Treino de ${relativeDayLabel(date, today)}`}
          workouts={state.workouts}
          queue={state.queue}
          nextId={nextId}
          currentId={workoutId ?? null}
          onPick={pickWorkout}
          onRest={isToday ? registerRest : undefined}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <ConfirmDialog
        open={dialog?.kind === 'complete'}
        title="Concluir treino?"
        message={`Ainda há ${progress ? progress.total - progress.done : 0} série(s) sem confirmar. Elas não serão salvas no histórico.`}
        confirmLabel="Concluir"
        danger={false}
        onClose={() => setDialog(null)}
        onConfirm={() => store.completeSession(date)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'discard'}
        title="Descartar treino?"
        message="As séries registradas nesta sessão serão apagadas. A fila não muda."
        confirmLabel="Descartar"
        onClose={() => setDialog(null)}
        onConfirm={() => dialog?.kind === 'discard' && store.clearDay(dialog.date)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'rest'}
        title="Registrar descanso?"
        message="As séries já registradas hoje serão descartadas e o treino volta para a fila."
        confirmLabel="Registrar descanso"
        onClose={() => setDialog(null)}
        onConfirm={() => store.logRest(date)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'swap'}
        title="Trocar de treino?"
        message="As séries já registradas nesta sessão serão descartadas."
        confirmLabel="Trocar"
        onClose={() => setDialog(null)}
        onConfirm={() => dialog?.kind === 'swap' && store.startSession(date, dialog.workoutId)}
      />
    </div>
  )
}

/* ---------- Seções ---------- */

function DoneSection({
  session,
  focus,
  isToday,
  nextLabel,
  onReopen,
}: {
  session: WorkoutSession
  focus: string
  isToday: boolean
  nextLabel: string
  onReopen: () => void
}) {
  const stats = sessionStats(session)
  return (
    <>
      <Hero name={session.workoutName} focus={focus} color={session.workoutColor} label={session.extra ? 'Treino extra concluído' : 'Concluído'}>
        <div className="grid grid-cols-3 gap-2">
          <Stat value={stats.sets} label="séries" />
          <Stat value={stats.volume.toLocaleString('pt-BR')} label="kg de volume" />
          <Stat value={stats.minutes ?? '–'} label="minutos" />
        </div>
        <div className="mt-4 flex gap-2">
          <Chip icon={<RotateCcw size={15} />} label={isToday ? 'Reabrir' : 'Reabrir para corrigir'} onClick={onReopen} />
        </div>
      </Hero>

      {isToday && (
        <div className="animate-pop-in flex items-center gap-3 rounded-2xl bg-lime p-4 text-on-accent">
          <Trophy size={26} className="shrink-0" />
          <div className="min-w-0">
            <p className="font-black">Treino concluído!</p>
            <p className="truncate text-sm font-medium text-on-accent/75">{nextLabel}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {Object.entries(session.logs).map(([id, log], i) => (
          <ExerciseLogCard
            key={id}
            index={i}
            exercise={{ id, name: log.name, sets: log.sets.length, reps: '', load: '', notes: '' }}
            sets={log.sets}
            previous={null}
            mode="readonly"
          />
        ))}
      </div>
    </>
  )
}

/* ---------- Peças visuais ---------- */

function Hero({
  name,
  focus,
  color,
  label,
  labelIcon,
  muted,
  children,
}: {
  name: string
  focus: string
  color: WorkoutColor
  label: string
  labelIcon?: ReactNode
  muted?: boolean
  children?: ReactNode
}) {
  const c = COLOR_STYLES[color]
  return (
    <section className={`rounded-3xl border p-5 ${muted ? 'border-dashed border-ink-700 bg-ink-900' : `${c.border} ${c.soft}`}`}>
      <div className="flex items-start gap-4">
        <WorkoutBadge name={name} color={color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className={`mb-1 inline-flex items-center gap-1 text-[11px] font-black tracking-wider uppercase ${muted ? 'text-ink-400' : c.text}`}>
            {labelIcon}
            {label}
          </p>
          <h2 className="text-xl leading-tight font-bold">{name}</h2>
          {focus && <p className="mt-0.5 text-sm text-ink-300">{focus}</p>}
        </div>
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}

function ProgressBar({ done, total, color }: { done: number; total: number; color: WorkoutColor }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-ink-300">
          <strong className="text-ink-100">{done}</strong> de {total} séries
        </span>
        <span className={`text-2xl font-black tabular-nums ${COLOR_STYLES[color].text}`}>{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink-950/60">
        <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${COLOR_STYLES[color].dot}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Chip({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-950/50 px-4 text-sm font-semibold text-ink-100 transition hover:bg-ink-950/80 active:scale-95"
    >
      {icon}
      {label}
    </button>
  )
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-ink-950/50 px-3 py-2.5">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-[11px] text-ink-400">{label}</p>
    </div>
  )
}

function Banner({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className="flex gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/8 p-3.5 text-sm leading-relaxed">
      <span className="mt-0.5 shrink-0 text-amber-300">{icon}</span>
      <div className="min-w-0 flex-1 text-ink-100">{children}</div>
    </div>
  )
}

function BannerButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 rounded-lg bg-ink-950/50 px-3 text-[13px] font-semibold text-ink-100 transition hover:bg-ink-950/80"
    >
      {children}
    </button>
  )
}

function StatusCard({
  icon,
  iconClass,
  title,
  text,
  children,
}: {
  icon: ReactNode
  iconClass: string
  title: string
  text: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-ink-900 px-6 py-12 text-center">
      <div className={`mb-4 grid size-16 place-items-center rounded-2xl bg-ink-800 ${iconClass}`}>{icon}</div>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-ink-400">{text}</p>
      {children}
    </div>
  )
}
