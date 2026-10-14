import { AlertCircle, Check, ChevronDown, History, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { formatSet, isSetValid, type PreviousPerformance, type SetField } from '../domain/sets'
import type { Exercise, SetLog } from '../types'
import { formatShortDate } from '../utils'
import { SetRow } from './SetRow'

type EditProps = {
  mode: 'edit'
  onUpdate: (index: number, field: SetField, value: string) => void
  onToggle: (index: number, done: boolean) => void
  onAddSet: () => void
  onRemoveSet: (index: number) => void
  onFillPrevious: () => void
}
type ReadProps = { mode: 'readonly' }

type Props = {
  index: number
  exercise: Exercise
  sets: SetLog[]
  previous: PreviousPerformance | null
} & (EditProps | ReadProps)

export function ExerciseLogCard(props: Props) {
  const { index, exercise, sets, previous } = props
  const doneCount = sets.filter((s) => s.done).length
  const complete = doneCount === sets.length && sets.length > 0
  const [expanded, setExpanded] = useState(!complete)
  // Séries em que o usuário tentou confirmar sem preencher → mostram erro.
  const [attempts, setAttempts] = useState<Record<number, number>>({})

  const isEdit = props.mode === 'edit'
  const showBody = !isEdit || expanded || !complete
  const hasInvalidAttempt = isEdit && sets.some((s, i) => attempts[i] && !s.done && !isSetValid(s))
  const canFill = isEdit && previous && sets.some((s) => !s.done && (!s.load || !s.reps || !s.rir))

  const header = (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-black transition ${
          complete ? 'bg-lime text-ink-950' : 'bg-ink-800 text-ink-300'
        }`}
      >
        {complete ? <Check size={15} strokeWidth={3.5} /> : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="leading-snug font-semibold">{exercise.name}</p>
        <p className="mt-0.5 text-[13px] text-ink-400">
          {!isEdit && sets.length > 0 ? (
            `${sets.length} séries registradas`
          ) : (
            <>
              Meta {exercise.sets} × {exercise.reps}
              {exercise.load && ` • ${exercise.load}`}
            </>
          )}
          {isEdit && <span className={complete ? 'text-lime' : ''}> • {doneCount}/{sets.length} séries</span>}
        </p>
      </div>
      {isEdit && complete && (
        <ChevronDown size={20} className={`mt-1 shrink-0 text-ink-400 transition ${expanded ? 'rotate-180' : ''}`} />
      )}
    </div>
  )

  return (
    <article
      data-exercise-card
      className={`rounded-2xl border p-4 transition ${complete ? 'border-lime/25 bg-ink-900/70' : 'border-ink-800 bg-ink-900'}`}
    >
      {isEdit && complete ? (
        <button type="button" className="w-full text-left" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {header}
        </button>
      ) : (
        header
      )}

      {showBody && (
        <div className="mt-3 space-y-3">
          {exercise.notes && <p className="text-[13px] text-ink-400 italic">{exercise.notes}</p>}

          {previous && (
            <div className="flex items-center gap-2 rounded-xl bg-ink-850 px-3 py-2">
              <History size={15} className="shrink-0 text-sky-400" />
              <p className="min-w-0 flex-1 truncate text-[13px] text-ink-300">
                <span className="text-ink-400">{formatShortDate(previous.date)}:</span> {previous.sets.map(formatSet).join(' · ')}
              </p>
              {canFill && (
                <button
                  type="button"
                  onClick={props.onFillPrevious}
                  className="h-8 shrink-0 rounded-lg bg-sky-400/12 px-2.5 text-xs font-bold text-sky-400 transition hover:bg-sky-400/20"
                >
                  Repetir
                </button>
              )}
            </div>
          )}

          {props.mode === 'edit' ? (
            <>
              <div className="grid grid-cols-[1.75rem_1fr_1fr_1fr_3rem] gap-1.5 text-center text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                <span>#</span>
                <span>Kg</span>
                <span>Reps</span>
                <span>RIR</span>
                <span />
              </div>
              <div className="space-y-2">
                {sets.map((set, i) => (
                  <SetRow
                    key={i}
                    index={i}
                    set={set}
                    previous={previous?.sets[Math.min(i, previous.sets.length - 1)]}
                    showErrors={(attempts[i] ?? 0) > 0}
                    shakeKey={attempts[i] ?? 0}
                    onChange={(field, value) => props.onUpdate(i, field, value)}
                    onToggle={() => {
                      if (set.done) return props.onToggle(i, false)
                      if (!isSetValid(set)) {
                        setAttempts((a) => ({ ...a, [i]: (a[i] ?? 0) + 1 }))
                        navigator.vibrate?.(40)
                        return
                      }
                      props.onToggle(i, true)
                      // Fechou o exercício? recolhe o card para a lista ficar curta.
                      if (sets.every((s, j) => j === i || s.done)) setExpanded(false)
                    }}
                  />
                ))}
              </div>

              {hasInvalidAttempt && (
                <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-red-400">
                  <AlertCircle size={15} /> Preencha carga, reps e RIR para confirmar a série.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={props.onAddSet}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink-800 px-3.5 text-sm font-semibold text-ink-300 transition hover:bg-ink-700"
                >
                  <Plus size={16} /> Série
                </button>
                {sets.length > 1 && !sets[sets.length - 1].done && (
                  <button
                    type="button"
                    onClick={() => props.onRemoveSet(sets.length - 1)}
                    aria-label="Remover última série"
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink-400 transition hover:bg-ink-800"
                  >
                    <Minus size={16} /> Série
                  </button>
                )}
                <span className="ml-auto self-center text-[11px] text-ink-600">RIR 0 = até a falha</span>
              </div>
            </>
          ) : (
            sets.length > 0 && (
              <ul className="space-y-1">
                {sets.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-center font-bold text-lime tabular-nums">{i + 1}</span>
                    <span className="tabular-nums">{s.load.replace('.', ',')} kg</span>
                    <span className="text-ink-400">×</span>
                    <span className="tabular-nums">{s.reps} reps</span>
                    <span className="ml-auto rounded-md bg-ink-800 px-2 py-0.5 text-xs font-semibold text-ink-300">RIR {s.rir}</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </article>
  )
}
