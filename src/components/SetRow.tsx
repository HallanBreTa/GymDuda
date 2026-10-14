import { Check, Lock } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { isSetValid, validateSet, type SetField } from '../domain/sets'
import type { SetLog } from '../types'

type Props = {
  index: number
  set: SetLog
  previous?: SetLog
  /** Mostra os erros (depois que o usuário tentou confirmar uma série incompleta). */
  showErrors: boolean
  /** Muda a cada tentativa inválida para reiniciar a animação de "shake". */
  shakeKey: number
  onChange: (field: SetField, value: string) => void
  onToggle: () => void
}

const FIELDS: { field: SetField; label: string; inputMode: 'decimal' | 'numeric'; maxLength: number }[] = [
  { field: 'load', label: 'Carga', inputMode: 'decimal', maxLength: 6 },
  { field: 'reps', label: 'Reps', inputMode: 'numeric', maxLength: 3 },
  { field: 'rir', label: 'RIR', inputMode: 'numeric', maxLength: 2 },
]

/** Mantém só o que faz sentido em cada campo enquanto o usuário digita. */
const sanitize = (field: SetField, value: string) =>
  field === 'load' ? value.replace(/[^\d.,]/g, '').replace(/([.,].*)[.,]/, '$1') : value.replace(/\D/g, '')

/** Enter/"próximo" no teclado do celular pula para o próximo campo editável do card. */
function focusNext(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  const card = e.currentTarget.closest('[data-exercise-card]')
  const inputs = Array.from(card?.querySelectorAll<HTMLInputElement>('input:not([disabled])') ?? [])
  const next = inputs[inputs.indexOf(e.currentTarget) + 1]
  if (next) next.focus()
  else e.currentTarget.blur()
}

export function SetRow({ index, set, previous, showErrors, shakeKey, onChange, onToggle }: Props) {
  const errors = showErrors && !set.done ? validateSet(set) : {}
  const valid = isSetValid(set)

  return (
    <div
      key={shakeKey}
      className={`grid grid-cols-[1.75rem_1fr_1fr_1fr_3rem] items-center gap-1.5 ${Object.keys(errors).length ? 'animate-shake' : ''}`}
    >
      <span className={`text-center text-sm font-bold tabular-nums ${set.done ? 'text-accent' : 'text-ink-400'}`}>{index + 1}</span>

      {FIELDS.map(({ field, label, inputMode, maxLength }) => {
        const hasError = !!errors[field]
        return (
          <input
            key={field}
            type="text"
            inputMode={inputMode}
            enterKeyHint="next"
            autoComplete="off"
            maxLength={maxLength}
            aria-label={`${label} da série ${index + 1}`}
            aria-invalid={hasError || undefined}
            title={errors[field]}
            disabled={set.done}
            value={set[field]}
            placeholder={previous?.[field] || '–'}
            onChange={(e) => onChange(field, sanitize(field, e.target.value))}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={focusNext}
            className={`h-12 w-full min-w-0 rounded-xl border text-center text-base font-semibold tabular-nums outline-none transition placeholder:font-normal placeholder:text-ink-600 ${
              set.done
                ? 'border-transparent bg-lime/8 text-ink-100'
                : hasError
                  ? 'border-red-500/80 bg-red-500/8 text-ink-100 ring-2 ring-red-500/20'
                  : 'border-ink-700 bg-ink-850 text-ink-100 focus:border-lime/70 focus:ring-2 focus:ring-lime/20'
            }`}
          />
        )
      })}

      <button
        type="button"
        onClick={onToggle}
        role="checkbox"
        aria-checked={set.done}
        aria-disabled={!set.done && !valid}
        aria-label={set.done ? `Desfazer série ${index + 1}` : `Confirmar série ${index + 1}`}
        className={`grid h-12 w-12 place-items-center rounded-xl border-2 transition active:scale-90 ${
          set.done
            ? 'border-lime bg-lime text-on-accent'
            : valid
              ? 'border-lime/70 text-accent hover:bg-lime/10'
              : 'border-ink-700 text-ink-600'
        }`}
      >
        {set.done || valid ? <Check size={22} strokeWidth={3} /> : <Lock size={16} />}
      </button>
    </div>
  )
}
