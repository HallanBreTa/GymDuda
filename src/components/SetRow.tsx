import { Check, Lock, Play, Square } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { digitsToSeconds, formatClock } from '../domain/rest'
import { isSetValid, MAX_SET_TIME_SEC, parseDecimal, validateSet, type SetField } from '../domain/sets'
import { beep, unlockAudio, vibrate } from '../feedback'
import type { ExerciseKind, SetLog } from '../types'

type Props = {
  index: number
  set: SetLog
  kind: ExerciseKind
  /** Meta de tempo da série (exercícios de tempo) — o cronômetro avisa ao atingir. */
  targetSec?: number | null
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
  const inputs = Array.from(card?.querySelectorAll<HTMLInputElement>('input:not([disabled]):not([readonly])') ?? [])
  const next = inputs[inputs.indexOf(e.currentTarget) + 1]
  if (next) next.focus()
  else e.currentTarget.blur()
}

const inputClass = (done: boolean, hasError: boolean) =>
  `h-12 w-full min-w-0 rounded-xl border text-center text-base font-semibold tabular-nums outline-none transition placeholder:font-normal placeholder:text-ink-600 ${
    done
      ? 'border-transparent bg-lime/8 text-ink-100'
      : hasError
        ? 'border-red-500/80 bg-red-500/8 text-ink-100 ring-2 ring-red-500/20'
        : 'border-ink-700 bg-ink-850 text-ink-100 focus:border-lime/70 focus:ring-2 focus:ring-lime/20'
  }`

export function SetRow({ index, set, kind, targetSec, previous, showErrors, shakeKey, onChange, onToggle }: Props) {
  const errors = showErrors && !set.done ? validateSet(set, kind) : {}
  const valid = isSetValid(set, kind)
  const shake = Object.keys(errors).length ? 'animate-shake' : ''

  const checkButton = (
    <button
      type="button"
      onClick={onToggle}
      role="checkbox"
      aria-checked={set.done}
      aria-disabled={!set.done && !valid}
      aria-label={set.done ? `Desfazer série ${index + 1}` : `Confirmar série ${index + 1}`}
      className={`grid h-12 w-12 place-items-center rounded-xl border-2 transition active:scale-90 ${
        set.done ? 'border-lime bg-lime text-on-accent' : valid ? 'border-lime/70 text-accent hover:bg-lime/10' : 'border-ink-700 text-ink-600'
      }`}
    >
      {set.done || valid ? <Check size={22} strokeWidth={3} /> : <Lock size={16} />}
    </button>
  )

  const number = (
    <span className={`text-center text-sm font-bold tabular-nums ${set.done ? 'text-accent' : 'text-ink-400'}`}>{index + 1}</span>
  )

  if (kind === 'time') {
    return (
      <div key={shakeKey} className={`grid grid-cols-[1.75rem_1fr_3rem_3rem] items-center gap-1.5 ${shake}`}>
        {number}
        <TimeInput
          index={index}
          set={set}
          targetSec={targetSec}
          previous={previous}
          hasError={!!errors.time}
          error={errors.time}
          onChange={(sec) => onChange('time', sec === null ? '' : String(sec))}
        />
        {checkButton}
      </div>
    )
  }

  return (
    <div key={shakeKey} className={`grid grid-cols-[1.75rem_1fr_1fr_1fr_3rem] items-center gap-1.5 ${shake}`}>
      {number}
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
            value={set[field] ?? ''}
            placeholder={previous?.[field] || '–'}
            onChange={(e) => onChange(field, sanitize(field, e.target.value))}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={focusNext}
            className={inputClass(set.done, hasError)}
          />
        )
      })}
      {checkButton}
    </div>
  )
}

/**
 * Campo de tempo + cronômetro da série.
 * - Digitação estilo micro-ondas (o teclado numérico não tem ":"): 4·5 → 0:45, 1·3·0 → 1:30.
 * - ▶ cronometra a série (guarda o horário de início, então não atrasa em segundo plano);
 *   ■ para e preenche o tempo. Ao atingir a meta, avisa com som/vibração (respeitando os Ajustes).
 */
function TimeInput({
  index,
  set,
  targetSec,
  previous,
  hasError,
  error,
  onChange,
}: {
  index: number
  set: SetLog
  targetSec?: number | null
  previous?: SetLog
  hasError: boolean
  error?: string
  onChange: (sec: number | null) => void
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const alerted = useRef(false)
  const running = startedAt !== null && !set.done
  const elapsed = running ? Math.min(MAX_SET_TIME_SEC, Math.floor((now - startedAt) / 1000)) : 0

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running])

  // Avisa uma vez quando atinge a meta.
  useEffect(() => {
    if (!running || !targetSec || alerted.current || elapsed < targetSec) return
    alerted.current = true
    vibrate([200, 100, 200])
    beep()
  }, [running, elapsed, targetSec])

  const seconds = parseDecimal(set.time ?? '')
  const shown = running ? formatClock(elapsed) : seconds !== null ? formatClock(seconds) : ''
  const prevSec = previous ? parseDecimal(previous.time ?? '') : null
  const reached = running && !!targetSec && elapsed >= targetSec

  const toggleStopwatch = () => {
    if (running) {
      onChange(Math.max(1, elapsed))
      setStartedAt(null)
      return
    }
    unlockAudio()
    alerted.current = false
    const at = Date.now()
    setNow(at)
    setStartedAt(at)
  }

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        aria-label={`Tempo da série ${index + 1}`}
        aria-invalid={hasError || undefined}
        title={error}
        disabled={set.done}
        readOnly={running}
        value={shown}
        placeholder={prevSec !== null ? formatClock(prevSec) : '0:00'}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          onChange(digits ? Math.min(MAX_SET_TIME_SEC, digitsToSeconds(digits) ?? 0) : null)
        }}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={focusNext}
        className={`${inputClass(set.done, hasError)} text-lg ${running ? (reached ? 'border-lime! text-accent' : 'border-sky-400/70!') : ''}`}
      />
      <button
        type="button"
        onClick={toggleStopwatch}
        disabled={set.done}
        aria-label={running ? `Parar cronômetro da série ${index + 1}` : `Cronometrar série ${index + 1}`}
        className={`grid h-12 w-12 place-items-center rounded-xl transition active:scale-90 disabled:opacity-30 ${
          running ? 'animate-pulse bg-sky-400 text-on-accent' : 'bg-sky-400/12 text-sky-400 hover:bg-sky-400/20'
        }`}
      >
        {running ? <Square size={16} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
    </>
  )
}
