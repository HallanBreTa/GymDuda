import { Check, Copy, Download, Share2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { buildTrainingLog, periodStart } from '../domain/exportLog'
import type { GymState } from '../types'
import { BottomSheet } from './BottomSheet'
import { Button } from './ui'

const PERIODS: { days: number | null; label: string }[] = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: null, label: 'Tudo' },
]

type Props = { state: GymState; today: string; open: boolean; onClose: () => void }

/** Gera um relatório do histórico para colar numa IA (ChatGPT, Claude, Gemini…). */
export function ExportSheet({ state, today, open, onClose }: Props) {
  const [days, setDays] = useState<number | null>(30)
  const [withPrompt, setWithPrompt] = useState(true)
  const [copied, setCopied] = useState(false)

  const text = useMemo(
    () => (open ? buildTrainingLog(state, { from: days ? periodStart(today, days) : null, today, withPrompt }) : ''),
    [open, state, today, days, withPrompt],
  )

  const fileName = `gymduda-log-${today}.md`
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sem permissão de área de transferência: o texto continua selecionável na prévia.
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const share = async () => {
    try {
      await navigator.share({ title: 'Log de treinos', text })
    } catch {
      // usuário cancelou
    }
  }

  return (
    <BottomSheet
      open={open}
      title="Exportar log para IA"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={copy}>
            {copied ? <Check size={18} strokeWidth={2.5} /> : <Copy size={18} />}
            {copied ? 'Copiado!' : 'Copiar'}
          </Button>
          {canShare && (
            <Button variant="secondary" aria-label="Compartilhar" onClick={share}>
              <Share2 size={18} />
            </Button>
          )}
          <Button variant="secondary" aria-label="Baixar arquivo" onClick={download}>
            <Download size={18} />
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-ink-400">
        Gera um resumo dos seus treinos (exercícios, cargas, repetições, RIR e atividades) para colar no ChatGPT, Claude ou
        outra IA.
      </p>

      <p className="mb-2 text-[13px] font-semibold text-ink-300">Período</p>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setDays(p.days)}
            aria-pressed={days === p.days}
            className={`h-10 rounded-xl text-sm font-semibold transition ${
              days === p.days ? 'bg-lime text-on-accent' : 'bg-ink-850 text-ink-300 hover:bg-ink-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl bg-ink-850 p-3">
        <input
          type="checkbox"
          checked={withPrompt}
          onChange={(e) => setWithPrompt(e.target.checked)}
          className="size-5 accent-lime"
        />
        <span className="text-sm">
          <span className="font-semibold">Incluir pedido de análise</span>
          <span className="block text-[13px] text-ink-400">A IA já recebe o que avaliar: progressão, volume, frequência…</span>
        </span>
      </label>

      <p className="mb-2 text-[13px] font-semibold text-ink-300">Prévia</p>
      <pre className="max-h-64 overflow-auto rounded-xl border border-ink-800 bg-ink-950 p-3 text-xs leading-relaxed whitespace-pre-wrap text-ink-300 select-text">
        {text}
      </pre>
    </BottomSheet>
  )
}
