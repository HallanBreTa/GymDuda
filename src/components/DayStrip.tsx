import { ArrowRightLeft, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { DayPlan } from '../domain/queue'
import type { Activity, Workout } from '../types'
import { addDays, COLOR_STYLES, formatShortDate, parseISODate, WEEKDAYS_SHORT } from '../utils'

type Props = {
  weekStart: string
  today: string
  selectedDate: string
  plans: Record<string, DayPlan>
  workoutsById: Map<string, Workout>
  activities: Record<string, Activity[]>
  onSelect: (date: string) => void
}

function Indicator({ plan, workoutsById, selected }: { plan?: DayPlan; workoutsById: Map<string, Workout>; selected: boolean }) {
  if (!plan) return <span className="h-3" />
  switch (plan.kind) {
    case 'done':
      return <Check size={12} strokeWidth={4} className={selected ? 'text-ink-950' : 'text-lime'} />
    case 'missed':
      return <X size={12} strokeWidth={4} className={selected ? 'text-ink-950' : 'text-red-400'} />
    case 'replaced':
      return <ArrowRightLeft size={12} strokeWidth={3} className={selected ? 'text-ink-950' : 'text-coral'} />
    case 'in_progress':
    case 'pending':
    case 'planned': {
      const id = plan.kind === 'in_progress' ? plan.session.workoutId : plan.workoutId
      const color = workoutsById.get(id)?.color
      const dot = selected ? 'bg-ink-950' : color ? COLOR_STYLES[color].dot : 'bg-ink-400'
      return (
        <span className="grid h-3 place-items-center">
          <span className={`size-1.5 rounded-full ${dot} ${plan.kind === 'in_progress' ? 'animate-pulse' : ''} ${plan.kind === 'planned' && !selected ? 'opacity-50' : ''}`} />
        </span>
      )
    }
    default:
      return (
        <span className="grid h-3 place-items-center">
          <span className={`size-1.5 rounded-full ${selected ? 'bg-ink-950/30' : 'bg-ink-700'}`} />
        </span>
      )
  }
}

export function DayStrip({ weekStart, today, selectedDate, plans, workoutsById, activities, onSelect }: Props) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = dates[6]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Semana anterior"
          onClick={() => onSelect(addDays(selectedDate, -7))}
          className="grid size-10 place-items-center rounded-full text-ink-300 transition hover:bg-ink-800 active:scale-90"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="text-[13px] font-semibold text-ink-400">
          {today >= weekStart && today <= weekEnd ? 'Esta semana' : `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`}
        </p>
        <button
          type="button"
          aria-label="Próxima semana"
          onClick={() => onSelect(addDays(selectedDate, 7))}
          className="grid size-10 place-items-center rounded-full text-ink-300 transition hover:bg-ink-800 active:scale-90"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <nav aria-label="Dias da semana" className="grid grid-cols-7 gap-1.5">
        {dates.map((date, i) => {
          const selected = date === selectedDate
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={selected}
              className={`relative flex flex-col items-center gap-0.5 rounded-2xl py-2.5 transition active:scale-95 ${
                selected ? 'bg-lime text-ink-950' : 'bg-ink-900 text-ink-300 hover:bg-ink-800'
              } ${date < today && !selected ? 'opacity-70' : ''}`}
            >
              <span className={`text-[11px] font-semibold uppercase ${selected ? 'text-ink-950/70' : 'text-ink-400'}`}>
                {WEEKDAYS_SHORT[i]}
              </span>
              <span className="text-base font-bold tabular-nums">{parseISODate(date).getDate()}</span>
              <Indicator plan={plans[date]} workoutsById={workoutsById} selected={selected} />
              {isToday && !selected && <span className="absolute inset-0 rounded-2xl ring-1 ring-lime/50 ring-inset" />}
              {/* Atividade extra no dia: ponto coral no canto */}
              {(activities[date] ?? []).some((a) => a.mode === 'extra') && (
                <span className={`absolute top-1.5 right-1.5 size-1.5 rounded-full ${selected ? 'bg-ink-950' : 'bg-coral'}`} />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
