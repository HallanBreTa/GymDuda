import { AlertCircle, ArrowRightLeft, Info, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ACTIVITY_META } from '../data/activityTypes'
import {
  activityFromDraft,
  canReplaceOn,
  draftFromActivity,
  INTENSITY_LABELS,
  validateActivity,
  type ActivityDraft,
} from '../domain/activities'
import { isTrainingDay, nextPlannedDay, nextWorkoutId } from '../domain/queue'
import { parseDecimal } from '../domain/sets'
import { ACTIVITY_TYPES, type Activity, type GymState, type Intensity } from '../types'
import { addDays, formatShortDate, relativeDayLabel, uid } from '../utils'
import { BottomSheet } from './BottomSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { Button, Field, TextArea } from './ui'
import { vibrate } from '../feedback'

type Props = {
  state: GymState
  today: string
  /** Atividade sendo editada (com a data em que está salva) ou null para nova. */
  editing: { date: string; activity: Activity } | null
  defaultDate: string
  onSave: (date: string, activity: Activity, previousDate?: string) => void
  onDelete: (date: string, id: string) => void
  onClose: () => void
}

const QUICK_MINUTES = [15, 30, 45]
const INTENSITIES: Intensity[] = ['light', 'moderate', 'intense']

const numericOnly = (v: string) => v.replace(/\D/g, '').slice(0, 4)
const decimalOnly = (v: string) => v.replace(/[^\d.,]/g, '').replace(/([.,].*)[.,]/, '$1').slice(0, 6)

export function ActivityForm({ state, today, editing, defaultDate, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<ActivityDraft>(() =>
    editing
      ? draftFromActivity(editing.date, editing.activity)
      : { date: defaultDate > today ? today : defaultDate, type: 'cardio', duration: '', distance: '', intensity: null, calories: '', notes: '', mode: 'extra' },
  )
  const [submitted, setSubmitted] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const errors = validateActivity(draft)
  const visibleErrors = submitted ? errors : {}
  const meta = ACTIVITY_META[draft.type]

  /* ----- Impacto na fila ----- */
  const replaceAllowed = canReplaceOn(state, draft.date, today, editing?.activity.id)
  const mode = replaceAllowed ? draft.mode : 'extra'
  const pendingName = state.workouts.find((w) => w.id === nextWorkoutId(state))?.name ?? 'o treino'
  // Para onde o treino iria se esta atividade o substituísse (só faz sentido para hoje).
  const rolledTo =
    replaceAllowed && draft.date === today
      ? nextPlannedDay(
          { ...state, activities: { ...state.activities, [today]: [{ ...activityFromDraft(draft, { id: '_', createdAt: 0 }), mode: 'replace' }] } },
          addDays(today, 1),
          today,
        )
      : null

  const save = () => {
    setSubmitted(true)
    if (Object.keys(errors).length) {
      vibrate(40)
      return
    }
    const activity = activityFromDraft({ ...draft, mode }, editing?.activity ?? { id: uid(), createdAt: Date.now() })
    onSave(draft.date, activity, editing?.date)
    onClose()
  }

  const duration = parseDecimal(draft.duration) ?? 0

  return (
    <>
      <BottomSheet
        open
        title={editing ? 'Editar atividade' : 'Atividade extra / Cardio'}
        onClose={onClose}
        footer={
          <div className="flex gap-3">
            {editing && (
              <Button variant="danger" aria-label="Excluir atividade" className="px-4" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={18} />
              </Button>
            )}
            <Button className="flex-1" onClick={save}>
              {editing ? 'Salvar alterações' : 'Registrar atividade'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6 pt-1">
          {/* Tipo */}
          <div>
            <Label>Tipo de atividade</Label>
            <div className="grid grid-cols-4 gap-2">
              {ACTIVITY_TYPES.map((type) => {
                const { short, icon: Icon } = ACTIVITY_META[type]
                const active = draft.type === type
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set('type', type)}
                    className={`flex h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition active:scale-95 ${
                      active ? 'bg-coral text-on-accent' : 'bg-ink-850 text-ink-300 hover:bg-ink-800'
                    }`}
                  >
                    <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                    {short}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Duração */}
          <div>
            <Label>Duração</Label>
            <div
              className={`flex h-16 items-center rounded-2xl border px-4 transition focus-within:ring-2 ${
                visibleErrors.duration
                  ? 'border-red-500/80 bg-red-500/8 focus-within:ring-red-500/20'
                  : 'border-ink-700 bg-ink-850 focus-within:border-coral/70 focus-within:ring-coral/20'
              }`}
            >
              <input
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                aria-label="Duração em minutos"
                aria-invalid={!!visibleErrors.duration || undefined}
                autoFocus={!editing}
                placeholder="0"
                value={draft.duration}
                onChange={(e) => set('duration', numericOnly(e.target.value))}
                className="w-full min-w-0 bg-transparent text-3xl font-black tabular-nums outline-none placeholder:text-ink-600"
              />
              <span className="text-base font-semibold text-ink-400">min</span>
            </div>
            <div className="mt-2 flex gap-2">
              {QUICK_MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('duration', String(Math.min(1440, duration + m)))}
                  className="h-10 flex-1 rounded-xl bg-ink-800 text-sm font-bold text-ink-100 transition hover:bg-ink-700 active:scale-95"
                >
                  +{m} min
                </button>
              ))}
              {draft.duration && (
                <button
                  type="button"
                  onClick={() => set('duration', '')}
                  className="h-10 rounded-xl px-3 text-sm font-semibold text-ink-400 transition hover:bg-ink-800"
                >
                  Limpar
                </button>
              )}
            </div>
            {visibleErrors.duration && <ErrorText>{visibleErrors.duration}</ErrorText>}
          </div>

          {/* Distância e calorias */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Distância" hint={meta.distance ? 'km' : 'km · opcional'}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="–"
                value={draft.distance}
                onChange={(e) => set('distance', decimalOnly(e.target.value))}
                aria-invalid={!!visibleErrors.distance || undefined}
                className={inputClass(!!visibleErrors.distance)}
              />
            </Field>
            <Field label="Calorias" hint="opcional">
              <input
                type="text"
                inputMode="numeric"
                placeholder="kcal"
                value={draft.calories}
                onChange={(e) => set('calories', numericOnly(e.target.value))}
                aria-invalid={!!visibleErrors.calories || undefined}
                className={inputClass(!!visibleErrors.calories)}
              />
            </Field>
          </div>
          {(visibleErrors.distance || visibleErrors.calories) && (
            <ErrorText>{visibleErrors.distance ?? visibleErrors.calories}</ErrorText>
          )}

          {/* Intensidade */}
          <div>
            <Label hint="opcional">Intensidade</Label>
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-ink-850 p-1">
              {INTENSITIES.map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={draft.intensity === i}
                  onClick={() => set('intensity', draft.intensity === i ? null : i)}
                  className={`h-11 rounded-xl text-sm font-semibold transition ${
                    draft.intensity === i ? 'bg-ink-700 text-ink-100 shadow' : 'text-ink-400 hover:text-ink-100'
                  }`}
                >
                  {INTENSITY_LABELS[i]}
                </button>
              ))}
            </div>
          </div>

          <Field label="Observações" hint="opcional">
            <TextArea value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: esteira pós-trabalho, tiros de 1km" />
          </Field>

          {/* Data */}
          <div>
            <Label>Quando</Label>
            <div className="flex gap-2">
              {[today, addDays(today, -1)].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={draft.date === d}
                  onClick={() => set('date', d)}
                  className={`h-11 rounded-xl px-4 text-sm font-semibold capitalize transition ${
                    draft.date === d ? 'bg-ink-100 text-ink-950' : 'bg-ink-850 text-ink-300 hover:bg-ink-800'
                  }`}
                >
                  {relativeDayLabel(d, today)}
                </button>
              ))}
              <input
                type="date"
                aria-label="Outra data"
                max={today}
                value={draft.date}
                onChange={(e) => e.target.value && e.target.value <= today && set('date', e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-850 px-3 text-sm text-ink-100 outline-none focus:border-coral/70"
              />
            </div>
          </div>

          {/* Impacto na fila */}
          <div>
            <Label>Impacto na fila de treinos</Label>
            {replaceAllowed ? (
              <div className="space-y-2" role="radiogroup">
                <ModeOption
                  selected={mode === 'extra'}
                  onSelect={() => set('mode', 'extra')}
                  icon={<Plus size={18} />}
                  title="Atividade extra / complementar"
                  text={`A fila segue intacta: ${pendingName} continua previsto${draft.date === today ? ' para hoje' : ''}.`}
                />
                <ModeOption
                  selected={mode === 'replace'}
                  onSelect={() => set('mode', 'replace')}
                  icon={<ArrowRightLeft size={18} />}
                  title={`Substituir o treino ${draft.date === today ? 'de hoje' : 'do dia'}`}
                  text={
                    draft.date === today
                      ? `${pendingName} vai para ${rolledTo ? `${relativeDayLabel(rolledTo.date, today)} (${formatShortDate(rolledTo.date)})` : 'o próximo dia de treino'}.`
                      : 'O dia deixa de contar como falta. A fila não muda.'
                  }
                />
              </div>
            ) : (
              <p className="flex gap-2 rounded-xl bg-ink-850 p-3 text-[13px] leading-relaxed text-ink-300">
                <Info size={16} className="mt-0.5 shrink-0 text-sky-400" />
                {extraReason(state, draft.date, editing?.activity.id)}
              </p>
            )}
          </div>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir atividade?"
        message={
          editing?.activity.mode === 'replace'
            ? 'Esta atividade substituía o treino do dia. Ao excluir, o treino volta para esse dia na fila.'
            : 'A atividade será removida do histórico.'
        }
        confirmLabel="Excluir"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (editing) onDelete(editing.date, editing.activity.id)
          onClose()
        }}
      />
    </>
  )
}

/** Explica por que a atividade só pode ser extra naquela data. */
function extraReason(state: GymState, date: string, excludeId?: string) {
  const log = state.history[date]
  if (log?.status === 'done') return 'Complementa o treino já concluído neste dia. A fila não muda.'
  if (log?.status === 'in_progress') return 'Há um treino em andamento neste dia — a atividade entra como complementar.'
  if (log?.status === 'rest') return 'Descanso registrado neste dia — a atividade entra como extra e não afeta a fila.'
  if ((state.activities[date] ?? []).some((a) => a.mode === 'replace' && a.id !== excludeId))
    return 'Outra atividade já substitui o treino deste dia. Esta entra como extra.'
  if (!state.queue.length) return 'Sua fila de treinos está vazia — a atividade é registrada como extra.'
  if (!isTrainingDay(state, date)) return 'Dia de descanso: a atividade é extra e não afeta a fila.'
  return 'A atividade é registrada como extra e não afeta a fila.'
}

const inputClass = (error: boolean) =>
  `h-12 w-full rounded-xl border px-4 text-base text-ink-100 tabular-nums outline-none transition placeholder:text-ink-600 focus:ring-2 ${
    error ? 'border-red-500/80 bg-red-500/8 focus:ring-red-500/20' : 'border-ink-700 bg-ink-850 focus:border-coral/70 focus:ring-coral/20'
  }`

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-2 flex items-baseline justify-between text-[13px] font-semibold text-ink-300">
      {children}
      {hint && <span className="font-normal text-ink-400">{hint}</span>}
    </span>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-red-400">
      <AlertCircle size={14} /> {children}
    </p>
  )
}

function ModeOption({
  selected,
  onSelect,
  icon,
  title,
  text,
}: {
  selected: boolean
  onSelect: () => void
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99] ${
        selected ? 'border-coral/60 bg-coral/8' : 'border-ink-700 bg-ink-850 hover:border-ink-600'
      }`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${selected ? 'bg-coral text-on-accent' : 'bg-ink-800 text-ink-300'}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-[13px] leading-snug text-ink-400">{text}</span>
      </span>
      <span className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-coral' : 'border-ink-600'}`}>
        {selected && <span className="size-2.5 rounded-full bg-coral" />}
      </span>
    </button>
  )
}
