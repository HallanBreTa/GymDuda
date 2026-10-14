import { MonitorSmartphone, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { SyncPanel } from '../components/SyncPanel'
import type { CloudSync } from '../hooks/useCloudSync'
import type { ThemePref } from '../theme'

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'system', label: 'Automático', icon: MonitorSmartphone },
]

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-ink-800 bg-ink-900 p-4">
      <h2 className="font-bold">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-ink-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

type Props = { sync: CloudSync; theme: ThemePref; onThemeChange: (theme: ThemePref) => void }

export function SettingsView({ sync, theme, onThemeChange }: Props) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-ink-400">Preferências deste aparelho</p>
        <h1 className="text-3xl font-black tracking-tight">Ajustes</h1>
      </header>

      <Section title="Aparência" description="Automático segue o tema claro/escuro do celular ou computador.">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
          {THEMES.map(({ value, label, icon: Icon }) => {
            const active = theme === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onThemeChange(value)}
                className={`flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border text-sm font-semibold transition active:scale-[0.98] ${
                  active ? 'border-lime bg-lime/12 text-ink-100' : 'border-ink-800 bg-ink-850 text-ink-300 hover:border-ink-700'
                }`}
              >
                <Icon size={20} className={active ? 'text-accent' : ''} />
                {label}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Sincronização" description="Salva seus treinos na nuvem e mantém todos os seus aparelhos iguais.">
        <SyncPanel sync={sync} />
      </Section>
    </div>
  )
}
