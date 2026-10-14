import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import type { Exercise } from '../types'
import { uid } from '../utils'
import { BottomSheet } from './BottomSheet'
import { Button, Field, TextArea, TextInput } from './ui'

type Props = {
  exercise: Exercise | null // null = novo exercício
  onSave: (exercise: Exercise) => void
  onClose: () => void
}

const REP_PRESETS = ['6-8', '8-10', '10-12', '12-15', '15-20']

export function ExerciseEditor({ exercise, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Exercise>(
    () => exercise ?? { id: uid(), name: '', sets: 3, reps: '10-12', load: '', notes: '' },
  )
  const set = <K extends keyof Exercise>(key: K, value: Exercise[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const canSave = draft.name.trim().length > 0

  const submit = () => {
    if (!canSave) return
    onSave({ ...draft, name: draft.name.trim(), reps: draft.reps.trim(), load: draft.load.trim(), notes: draft.notes.trim() })
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
        <Field label="Nome do exercício">
          <TextInput
            autoFocus={!exercise}
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Ex.: Supino reto com barra"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Séries">
            <div className="flex h-12 items-center justify-between rounded-xl border border-ink-700 bg-ink-850">
              <button
                type="button"
                aria-label="Diminuir séries"
                onClick={() => set('sets', Math.max(1, draft.sets - 1))}
                className="grid h-full w-12 place-items-center text-ink-300 active:text-lime"
              >
                <Minus size={18} />
              </button>
              <span className="text-lg font-bold tabular-nums">{draft.sets}</span>
              <button
                type="button"
                aria-label="Aumentar séries"
                onClick={() => set('sets', Math.min(20, draft.sets + 1))}
                className="grid h-full w-12 place-items-center text-ink-300 active:text-lime"
              >
                <Plus size={18} />
              </button>
            </div>
          </Field>
          <Field label="Repetições">
            <TextInput value={draft.reps} onChange={(e) => set('reps', e.target.value)} placeholder="10-12" />
          </Field>
        </div>

        <div className="scrollbar-none -mx-5 -mt-2 flex gap-2 overflow-x-auto px-5">
          {REP_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => set('reps', r)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition ${
                draft.reps === r ? 'bg-lime text-ink-950' : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <Field label="Carga" hint="opcional">
          <TextInput value={draft.load} onChange={(e) => set('load', e.target.value)} placeholder="Ex.: 40kg, 2x20kg, peso corporal" />
        </Field>

        <Field label="Observações" hint="opcional">
          <TextArea
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Ex.: Cadência 3-1-1, descanso de 90s"
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </BottomSheet>
  )
}
