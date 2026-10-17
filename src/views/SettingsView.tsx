import {
  BellRing,
  ChevronRight,
  FileJson,
  MonitorSmartphone,
  Moon,
  Sun,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ImportSheet } from '../components/ImportSheet'
import { SyncPanel } from '../components/SyncPanel'
import { ToggleRow } from '../components/ui'
import type { ImportedPlan } from '../domain/importWorkouts'
import { canVibrate, restFinishedAlert, unlockAudio, useFeedbackPrefs } from '../feedback'
import type { CloudSync } from '../hooks/useCloudSync'
import type { ThemePref } from '../theme'
import type { GymState } from '../types'

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

type Props = {
  state: GymState
  sync: CloudSync
  theme: ThemePref
  onThemeChange: (theme: ThemePref) => void
  onImport: (plan: ImportedPlan, mode: 'replace' | 'add', useDays: boolean) => void
}

export function SettingsView({ state, sync, theme, onThemeChange, onImport }: Props) {
  const [importOpen, setImportOpen] = useState(false)
  const [feedback, setFeedback] = useFeedbackPrefs()
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-ink-400">Preferências e ferramentas</p>
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

      <Section title="Som e vibração" description="Alertas do cronômetro de descanso e avisos de série incompleta. Vale só para este aparelho.">
        <div className="space-y-2">
          <ToggleRow
            icon={feedback.sound ? Volume2 : VolumeX}
            label="Som"
            hint="Bipe quando o descanso termina"
            checked={feedback.sound}
            onChange={(sound) => setFeedback({ sound })}
          />
          <ToggleRow
            icon={feedback.vibration ? Vibrate : VibrateOff}
            label="Vibração"
            hint={canVibrate() ? 'Vibra no fim do descanso e em série incompleta' : 'Este aparelho/navegador não permite vibrar (ex.: iPhone)'}
            checked={feedback.vibration}
            disabled={!canVibrate()}
            onChange={(vibration) => setFeedback({ vibration })}
          />
          <button
            type="button"
            disabled={!feedback.sound && !(feedback.vibration && canVibrate())}
            onClick={() => {
              unlockAudio()
              restFinishedAlert()
            }}
            className="mt-1 inline-flex h-11 items-center gap-2 rounded-xl bg-ink-850 px-4 text-sm font-semibold text-ink-100 transition hover:bg-ink-800 active:scale-95 disabled:opacity-40"
          >
            <BellRing size={17} /> Testar alerta
          </button>
        </div>
      </Section>

      <Section title="Importar treinos" description="Cole um JSON gerado pela IA para montar seus treinos em segundos.">
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl bg-ink-850 p-3 text-left transition hover:bg-ink-800 active:scale-[0.99]"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-sky-400/12 text-sky-400">
            <FileJson size={20} />
          </span>
          <div className="flex-1">
            <p className="font-semibold">Importação rápida</p>
            <p className="text-[13px] text-ink-400">Pedido pronto para a IA, exemplo e colar JSON</p>
          </div>
          <ChevronRight size={20} className="text-ink-400" />
        </button>
        <ImportSheet state={state} open={importOpen} onClose={() => setImportOpen(false)} onImport={onImport} />
      </Section>

      <Section title="Sincronização" description="Salva seus treinos na nuvem e mantém todos os seus aparelhos iguais.">
        <SyncPanel sync={sync} />
      </Section>
    </div>
  )
}
