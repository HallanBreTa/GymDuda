import { Check, Moon } from 'lucide-react'
import type { Workout } from '../types'
import { BottomSheet } from './BottomSheet'
import { WorkoutBadge } from './ui'

type Props = {
  title: string
  workouts: Workout[]
  queue: string[]
  nextId: string | null
  currentId: string | null
  onPick: (workoutId: string) => void
  onRest?: () => void
  onClose: () => void
}

/** Escolha manual do treino do dia. Mostra a fila em ordem e destaca o próximo. */
export function WorkoutPicker({ title, workouts, queue, nextId, currentId, onPick, onRest, onClose }: Props) {
  const byId = new Map(workouts.map((w) => [w.id, w]))
  const inQueue = queue.map((id) => byId.get(id)).filter((w): w is Workout => !!w)
  const loose = workouts.filter((w) => !queue.includes(w.id))

  const item = (w: Workout) => (
    <li key={w.id}>
      <button
        type="button"
        onClick={() => {
          onPick(w.id)
          onClose()
        }}
        className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
          currentId === w.id ? 'border-lime/60 bg-lime/8' : 'border-transparent bg-ink-850 hover:bg-ink-800'
        }`}
      >
        <WorkoutBadge name={w.name} color={w.color} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            <span className="truncate">{w.name}</span>
            {w.id === nextId && (
              <span className="shrink-0 rounded-full bg-lime px-1.5 py-px text-[10px] font-black text-on-accent uppercase">Próximo</span>
            )}
          </p>
          <p className="truncate text-[13px] text-ink-400">
            {w.focus || 'Sem foco definido'} • {w.exercises.length} exercícios
          </p>
        </div>
        {currentId === w.id && <Check size={20} className="text-accent" />}
      </button>
    </li>
  )

  return (
    <BottomSheet open title={title} onClose={onClose}>
      <p className="mb-3 text-[13px] text-ink-400">
        Fazer um treino diferente do próximo não altera a fila — o próximo continua esperando a vez dele.
      </p>
      <ul className="space-y-2">{inQueue.map(item)}</ul>

      {loose.length > 0 && (
        <>
          <p className="mt-5 mb-2 text-[13px] font-semibold text-ink-300">Fora da fila</p>
          <ul className="space-y-2">{loose.map(item)}</ul>
        </>
      )}

      {onRest && (
        <button
          type="button"
          onClick={() => {
            onRest()
            onClose()
          }}
          className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-ink-600 p-3 text-left transition hover:border-sky-400/60"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-ink-800 text-sky-300">
            <Moon size={20} />
          </span>
          <div>
            <p className="font-semibold">Registrar descanso</p>
            <p className="text-[13px] text-ink-400">O treino pendente passa para o próximo dia de treino</p>
          </div>
        </button>
      )}
    </BottomSheet>
  )
}
