import { Check, Copy, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { aiImportPrompt, currentPlanJson, exampleJson, formatDays, parseImport, type ImportedPlan } from '../domain/importWorkouts'
import type { GymState } from '../types'
import { BottomSheet } from './BottomSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { Button, TextArea, WorkoutBadge } from './ui'

type Mode = 'replace' | 'add'

type Props = {
  state: GymState
  open: boolean
  onClose: () => void
  onImport: (plan: ImportedPlan, mode: Mode, useDays: boolean) => void
}

function CopyButton({ label, getText }: { label: string; getText: () => string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // sem permissão: o exemplo continua visível para copiar à mão
    }
  }
  return (
    <Button variant="secondary" className="min-h-11 w-full justify-start px-4 text-sm" onClick={copy}>
      {copied ? <Check size={17} strokeWidth={2.5} className="text-accent" /> : <Copy size={17} />}
      {copied ? 'Copiado!' : label}
    </Button>
  )
}

/** Importação rápida de treinos colando um JSON (gerado pela IA ou editado a partir do exemplo). */
export function ImportSheet({ state, open, onClose, onImport }: Props) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('replace')
  const [useDays, setUseDays] = useState(true)
  const [confirming, setConfirming] = useState(false)

  // Memoizado: cada leitura gera ids novos.
  const result = useMemo(() => (text.trim() ? parseImport(text) : null), [text])
  const plan = result?.ok ? result.plan : null

  const close = () => {
    setText('')
    onClose()
  }

  const doImport = () => {
    if (!plan) return
    onImport(plan, mode, useDays && !!plan.trainingDays)
    close()
  }

  return (
    <>
      <BottomSheet
        open={open}
        title="Importar treinos"
        onClose={close}
        footer={
          <Button className="w-full" disabled={!plan} onClick={() => (mode === 'replace' ? setConfirming(true) : doImport())}>
            {plan ? `Importar ${plan.workouts.length} ${plan.workouts.length === 1 ? 'treino' : 'treinos'}` : 'Importar'}
          </Button>
        }
      >
        <div className="space-y-5">
          <section>
            <h3 className="mb-1 text-sm font-bold">1. Peça para a IA</h3>
            <p className="mb-3 text-[13px] text-ink-400">
              Copie o pedido, cole no ChatGPT, Claude ou outra IA e escreva no final o que você quer (objetivo, dias por semana,
              equipamentos…). A IA responde com um JSON no formato certo.
            </p>
            <div className="space-y-2">
              <CopyButton label="Copiar pedido para a IA" getText={aiImportPrompt} />
              <CopyButton label="Copiar só o exemplo (JSON)" getText={exampleJson} />
              <CopyButton label="Copiar meus treinos atuais (JSON)" getText={() => currentPlanJson(state)} />
            </div>
            <details className="mt-3 rounded-xl bg-ink-850 px-3 py-2">
              <summary className="cursor-pointer text-[13px] font-semibold text-ink-300">Ver exemplo</summary>
              <pre className="mt-2 max-h-56 overflow-auto text-xs leading-relaxed text-ink-300 select-text">{exampleJson()}</pre>
            </details>
          </section>

          <section>
            <h3 className="mb-1 text-sm font-bold">2. Cole a resposta</h3>
            <TextArea
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='{ "formato": "gymduda-treinos", "treinos": [ … ] }'
              spellCheck={false}
              className="font-mono text-sm"
            />

            {result && !result.ok && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/8 p-3 text-[13px] text-red-400">
                <p className="mb-1 flex items-center gap-2 font-semibold">
                  <TriangleAlert size={16} /> Não deu para importar
                </p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {result.errors.slice(0, 8).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {result.errors.length > 8 && <li>…e mais {result.errors.length - 8} problemas.</li>}
                </ul>
              </div>
            )}
          </section>

          {plan && (
            <section className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-bold">3. Confira</h3>
                <ul className="space-y-2">
                  {plan.workouts.map((w) => (
                    <li key={w.id} className="flex items-center gap-3 rounded-2xl bg-ink-850 p-3">
                      <WorkoutBadge name={w.name} color={w.color} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{w.name}</p>
                        <p className="truncate text-[12px] text-ink-400">
                          {w.exercises.length} exercícios · {w.exercises.map((e) => e.name).join(', ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como importar">
                {(
                  [
                    ['replace', 'Substituir', 'Troca a divisão atual'],
                    ['add', 'Adicionar', 'Junta aos meus treinos'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => setMode(value)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      mode === value ? 'border-lime bg-lime/12' : 'border-ink-800 bg-ink-850 hover:border-ink-700'
                    }`}
                  >
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-[12px] text-ink-400">{hint}</p>
                  </button>
                ))}
              </div>

              {plan.trainingDays && (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-ink-850 p-3">
                  <input type="checkbox" checked={useDays} onChange={(e) => setUseDays(e.target.checked)} className="size-5 accent-lime" />
                  <span className="text-sm">
                    <span className="font-semibold">Usar os dias de treino do JSON</span>
                    <span className="block text-[13px] text-ink-400">{formatDays(plan.trainingDays)}</span>
                  </span>
                </label>
              )}
            </section>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirming}
        title="Substituir seus treinos?"
        message="Seus treinos e a fila atuais serão trocados pelos importados. O histórico de treinos concluídos é mantido."
        confirmLabel="Substituir"
        onClose={() => setConfirming(false)}
        onConfirm={doImport}
      />
    </>
  )
}
