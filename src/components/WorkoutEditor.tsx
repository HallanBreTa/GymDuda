import { ChevronDown, ChevronUp, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { WORKOUT_COLORS, type Exercise, type Workout } from '../types'
import { COLOR_STYLES, uid } from '../utils'
import { BottomSheet } from './BottomSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { ExerciseEditor } from './ExerciseEditor'
import { Button, Field, TextInput, WorkoutBadge } from './ui'

type Props = {
  workout: Workout | null // null = novo treino
  suggestedName?: string
  onSave: (workout: Workout) => void
  onDelete?: (id: string) => void
  onClose: () => void
}

export function WorkoutEditor({ workout, suggestedName = '', onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<Workout>(
    () => workout ?? { id: uid(), name: suggestedName, focus: '', color: 'lime', exercises: [] },
  )
  // undefined = fechado, null = novo, Exercise = editando
  const [editingExercise, setEditingExercise] = useState<Exercise | null | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canSave = draft.name.trim().length > 0

  const upsertExercise = (exercise: Exercise) =>
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.some((e) => e.id === exercise.id)
        ? d.exercises.map((e) => (e.id === exercise.id ? exercise : e))
        : [...d.exercises, exercise],
    }))

  const removeExercise = (id: string) => setDraft((d) => ({ ...d, exercises: d.exercises.filter((e) => e.id !== id) }))

  const moveExercise = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const target = index + dir
      if (target < 0 || target >= d.exercises.length) return d
      const exercises = [...d.exercises]
      ;[exercises[index], exercises[target]] = [exercises[target], exercises[index]]
      return { ...d, exercises }
    })

  const submit = () => {
    if (!canSave) return
    onSave({ ...draft, name: draft.name.trim(), focus: draft.focus.trim() })
    onClose()
  }

  return (
    <>
      <BottomSheet
        open
        title={workout ? 'Editar treino' : 'Novo treino'}
        onClose={onClose}
        footer={
          <div className="flex gap-3">
            {workout && onDelete && (
              <Button variant="danger" aria-label="Excluir treino" className="px-4" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={18} />
              </Button>
            )}
            <Button className="flex-1" disabled={!canSave} onClick={submit}>
              {workout ? 'Salvar alterações' : 'Criar treino'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5 pt-1">
          <div className="flex items-center gap-3 rounded-2xl bg-ink-850 p-3">
            <WorkoutBadge name={draft.name || '?'} color={draft.color} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-bold">{draft.name || 'Nome do treino'}</p>
              <p className="truncate text-sm text-ink-400">{draft.focus || 'Foco muscular'}</p>
            </div>
          </div>

          <Field label="Nome do treino">
            <TextInput
              autoFocus={!workout}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Ex.: Treino A - Peito e Tríceps"
            />
          </Field>

          <Field label="Foco muscular">
            <TextInput
              value={draft.focus}
              onChange={(e) => setDraft((d) => ({ ...d, focus: e.target.value }))}
              placeholder="Ex.: Peito • Tríceps"
            />
          </Field>

          <div>
            <span className="mb-2 block text-[13px] font-semibold text-ink-300">Cor</span>
            <div className="flex gap-2.5">
              {WORKOUT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  aria-pressed={draft.color === c}
                  onClick={() => setDraft((d) => ({ ...d, color: c }))}
                  className={`size-10 rounded-full transition ${COLOR_STYLES[c].dot} ${
                    draft.color === c ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-ink-900' : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-300">Exercícios ({draft.exercises.length})</span>
            </div>

            {draft.exercises.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-700 py-6 text-center text-sm text-ink-400">
                <Dumbbell size={22} className="mb-2" />
                Nenhum exercício ainda
              </div>
            ) : (
              <ul className="space-y-2">
                {draft.exercises.map((exercise, i) => (
                  <li key={exercise.id} className="flex items-center gap-1 rounded-2xl bg-ink-850 py-1.5 pr-1.5 pl-1">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label="Mover para cima"
                        disabled={i === 0}
                        onClick={() => moveExercise(i, -1)}
                        className="grid h-6 w-8 place-items-center text-ink-400 hover:text-ink-100 disabled:opacity-20"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Mover para baixo"
                        disabled={i === draft.exercises.length - 1}
                        onClick={() => moveExercise(i, 1)}
                        className="grid h-6 w-8 place-items-center text-ink-400 hover:text-ink-100 disabled:opacity-20"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                    <button type="button" onClick={() => setEditingExercise(exercise)} className="min-w-0 flex-1 py-1 text-left">
                      <p className="truncate text-[15px] font-semibold">{exercise.name}</p>
                      <p className="truncate text-[13px] text-ink-400">
                        {exercise.sets} × {exercise.reps}
                        {exercise.load && ` • ${exercise.load}`}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label="Editar exercício"
                      onClick={() => setEditingExercise(exercise)}
                      className="grid size-10 place-items-center rounded-xl text-ink-300 hover:bg-ink-700"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="Remover exercício"
                      onClick={() => removeExercise(exercise.id)}
                      className="grid size-10 place-items-center rounded-xl text-ink-400 hover:bg-red-500/15 hover:text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Button variant="secondary" className="mt-3 w-full" onClick={() => setEditingExercise(null)}>
              <Plus size={18} /> Adicionar exercício
            </Button>
          </div>
        </div>
      </BottomSheet>

      {editingExercise !== undefined && (
        <ExerciseEditor exercise={editingExercise} onSave={upsertExercise} onClose={() => setEditingExercise(undefined)} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir treino?"
        message={`"${draft.name}" será removido e sairá da fila. Treinos já concluídos continuam no histórico.`}
        confirmLabel="Excluir"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (workout && onDelete) onDelete(workout.id)
          onClose()
        }}
      />
    </>
  )
}
