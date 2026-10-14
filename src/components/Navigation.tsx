import { CalendarDays, ChartColumn, Dumbbell, Flame, Settings } from 'lucide-react'
import type { Tab } from '../types'

const TABS: { id: Tab; label: string; icon: typeof Flame }[] = [
  { id: 'today', label: 'Hoje', icon: Flame },
  { id: 'workouts', label: 'Treinos', icon: Dumbbell },
  { id: 'week', label: 'Semana', icon: CalendarDays },
  { id: 'stats', label: 'Dados', icon: ChartColumn },
  { id: 'settings', label: 'Ajustes', icon: Settings },
]

type Props = { tab: Tab; onChange: (tab: Tab) => void }

/** Barra superior em telas médias+ */
export function TopBar({ tab, onChange }: Props) {
  return (
    <header className="sticky top-0 z-40 hidden border-b border-ink-800/80 bg-ink-950/85 backdrop-blur-xl md:block">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
        <Logo />
        <nav className="flex gap-1 rounded-2xl bg-ink-900 p-1" aria-label="Navegação principal">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                tab === id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'
              }`}
            >
              <Icon size={17} className={tab === id ? 'text-accent' : ''} />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}

/** Barra inferior no celular */
export function BottomNav({ tab, onChange }: Props) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800/80 bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className="flex h-16 flex-col items-center justify-center gap-1 transition active:scale-95"
            >
              <span className={`grid h-8 w-14 place-items-center rounded-full transition ${active ? 'bg-lime/15 text-accent' : 'text-ink-400'}`}>
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />
              </span>
              <span className={`text-[11px] font-semibold ${active ? 'text-ink-100' : 'text-ink-400'}`}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg bg-lime text-on-accent">
        <Dumbbell size={18} strokeWidth={2.5} />
      </span>
      <span className="text-lg font-black tracking-tight">
        Gym<span className="text-accent">Duda</span>
      </span>
    </div>
  )
}
