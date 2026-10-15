import { Dumbbell, Hourglass, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_REST_SEC, formatClock, formatRest, looksLikeDuration, MAX_REST_SEC, restOf } from '../domain/rest'
import { kindOf } from '../domain/sets'
import type { Exercise, ExerciseKind } from '../types'
import { uid } from '../utils'
import { BottomSheet } from './BottomSheet'
import { Button, Field, TextArea, TextInput } from './ui'

type Props = {
  exercise: Exercise | null // null = novo exercício
  onSave: (exercise: Exercise) => void
  onClose: () => void
}

const REP_PRESETS = ['6-8', '8-10', '10-12', '12-15', '15-20']
const TIME_PRESETS = ['30s', '45s', '1:00', '1:30', '2:00']

const KINDS: { value: ExerciseKind; label: string; hint: string; icon: typeof Dumbbell }[] = [
  { value: 'weight', label: 'Peso', hint: 'Kg · Reps · RIR', icon: Dumbbell },
  { value: 'time', label: 'Tempo', hint: 'Duração da série', icon: Hourglass },
]
const REST_PRESETS = [0, 45, 60, 90, 120, 180]

export function ExerciseEditor({ exercise, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Exercise>(
    () => exercise ?? { id: uid(), name: '', sets: 3, reps: '10-12', load: '', notes: '', restSec: DEFAULT_REST_SEC },
  )
  const set = <K extends keyof Exercise>(key: K, value: Exercise[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const rest = restOf(draft)
  const kind = kindOf(draft)
  const isTime = kind === 'time'
  const canSave = draft.name.trim().length > 0

  /** Ao trocar o tipo, troca também a meta se ela não fizer sentido no novo tipo. */
  const changeKind = (next: ExerciseKind) =>
    setDraft((d) => {
      const reps = next === 'time' ? (looksLikeDuration(d.reps) ? d.reps : '45s') : looksLikeDuration(d.reps) ? '10-12' : d.reps
      return { ...d, kind: next, reps }
    })

  const submit = () => {
    if (!canSave) return
    const { kind: _omit, ...base } = draft
    void _omit
    onSave({
      ...base,
      ...(isTime && { kind: 'time' as const }), // Peso é o padrão: não grava o campo
      name: draft.name.trim(),
      reps: draft.reps.trim(),
      load: isTime ? '' : draft.load.trim(),
      notes: draft.notes.trim(),
    })
    onClose()
  }

  return (
    <BottomSheet
      open
      level={1}
      title={exercise ? 'Editar exercício' : 'Novo exercício'}
      onClose={onClose}
      footer={
        <Button className="w-full" disabled={!canSave} onClick={submit}>
          {exercise ? 'Salvar exercício' : 'Adicionar exercício'}
        </Button>
      }
    >
      <form
        className="space-y-5 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink-850 p-1" role="radiogroup" aria-label="Tipo do exercício">
          {KINDS.map(({ value, label, hint, icon: Icon }) => {
            const active = kind === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => changeKind(value)}
                className={`flex h-14 items-center justify-center gap-2.5 rounded-xl transition ${
                  active ? 'bg-ink-700 text-ink-100 shadow' : 'text-ink-400 hover:text-ink-100'
                }`}
              >
                <Icon size={19} className={active ? (value === 'time' ? 'text-sky-400' : 'text-accent') : ''} />
                <span className="text-left leading-tight">
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="block text-[11px] font-medium text-ink-400">{hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        <Field label="Nome do exercício">
          <TextInput
            autoFocus={!exercise}
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={isTime ? 'Ex.: Prancha abdominal' : 'Ex.: Supino reto com barra'}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Séries">
            <div className="flex h-12 items-center justify-between rounded-xl border border-ink-700 bg-ink-850">
              <button
                type="button"
                aria-label="Diminuir séries"
                onClick={() => set('sets', Math.max(1, draft.sets - 1))}
                className="grid h-full w-12 place-items-center text-ink-300 active:text-accent"
              >
                <Minus size={18} />
              </button>
              <span className="text-lg font-bold tabular-nums">{draft.sets}</span>
              <button
                type="button"
                aria-label="Aumentar séries"
                onClick={() => set('sets', Math.min(20, draft.sets + 1))}
                className="grid h-full w-12 place-items-center text-ink-300 active:text-accent"
              >
                <Plus size={18} />
              </button>
            </div>
          </Field>
          <Field label={isTime ? 'Tempo alvo' : 'Repetições'}>
            <TextInput value={draft.reps} onChange={(e) => set('reps', e.target.value)} placeholder={isTime ? '45s' : '10-12'} />
          </Field>
        </div>

        <div className="scrollbar-none -mx-5 -mt-2 flex gap-2 overflow-x-auto px-5">
          {(isTime ? TIME_PRESETS : REP_PRESETS).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => set('reps', r)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition ${
                draft.reps === r ? 'bg-lime text-on-accent' : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div>
          <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold text-ink-300">
            Descanso entre séries
            <span className="font-normal text-ink-400">cronômetro ao confirmar a série</span>
          </span>
          <div className="flex h-12 items-center justify-between rounded-xl border border-ink-700 bg-ink-850">
            <button
              type="button"
              aria-label="Diminuir descanso em 15 segundos"
              onClick={() => set('restSec', Math.max(0, rest - 15))}
              className="h-full px-4 text-sm font-semibold text-ink-300 active:text-accent"
            >
              −15s
            </button>
            <span className="text-lg font-bold tabular-nums">{formatRest(rest)}</span>
            <button
              type="button"
              aria-label="Aumentar descanso em 15 segundos"
              onClick={() => set('restSec', Math.min(MAX_REST_SEC, rest + 15))}
              className="h-full px-4 text-sm font-semibold text-ink-300 active:text-accent"
            >
              +15s
            </button>
          </div>
          <div className="scrollbar-none -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
            {REST_PRESETS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => set('restSec', sec)}
                className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold tabular-nums transition ${
                  rest === sec ? 'bg-lime text-on-accent' : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
                }`}
              >
                {sec === 0 ? 'Sem' : formatClock(sec)}
              </button>
            ))}
          </div>
        </div>

{!isTime && (
        <Field label="Carga" hint="opcional">
          <TextInput value={draft.load} onChange={(e) => set('load', e.target.value)} placeholder="Ex.: 40kg, 2x20kg, peso corporal" />
        </Field>
        )}

        <Field label="Observações" hint="opcional">
          <TextArea
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Ex.: Cadência 3-1-1, pegada aberta"
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </BottomSheet>
  )
}
