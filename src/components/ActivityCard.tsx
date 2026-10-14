import { ChevronRight } from 'lucide-react'
import { ACTIVITY_META } from '../data/activityTypes'
import { activityDetails } from '../domain/activities'
import type { Activity, ActivityType } from '../types'

/** Badge redondo (treinos usam quadrado) — diferencia atividade avulsa de musculação. */
export function ActivityBadge({ type, size = 'md' }: { type: ActivityType; size?: 'sm' | 'md' }) {
  const Icon = ACTIVITY_META[type].icon
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-coral text-ink-950 ${size === 'sm' ? 'size-8' : 'size-11'}`}>
      <Icon size={size === 'sm' ? 16 : 21} strokeWidth={2.4} />
    </span>
  )
}

type Props = {
  activity: Activity
  onClick?: () => void
  highlight?: boolean
}

export function ActivityCard({ activity, onClick, highlight }: Props) {
  const meta = ACTIVITY_META[activity.type]
  const replaced = activity.mode === 'replace'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border border-coral/25 bg-coral/8 p-3 text-left transition enabled:hover:border-coral/45 enabled:active:scale-[0.99] ${
        highlight ? 'animate-pop-in' : ''
      }`}
    >
      <ActivityBadge type={activity.type} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-semibold">{meta.label}</span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-black uppercase ${
              replaced ? 'bg-coral text-ink-950' : 'bg-ink-950/50 text-coral'
            }`}
          >
            {replaced ? 'No lugar do treino' : 'Extra'}
          </span>
        </p>
        <p className="truncate text-[13px] text-ink-300">{activityDetails(activity).join(' · ')}</p>
        {activity.notes && <p className="truncate text-[13px] text-ink-400 italic">{activity.notes}</p>}
      </div>
      {onClick && <ChevronRight size={18} className="shrink-0 text-ink-600" />}
    </button>
  )
}
