/** Regras das atividades avulsas (cardio, esportes, mobilidade). */
import type { Activity, ActivityMode, ActivityType, GymState, Intensity } from '../types'
import { isTrainingDay } from './queue'
import { parseDecimal } from './sets'

export const INTENSITY_LABELS: Record<Intensity, string> = {
  light: 'Leve',
  moderate: 'Moderada',
  intense: 'Intensa',
}

/**
 * A atividade pode substituir o treino da data?
 * Só faz sentido num dia de treino (até hoje), com fila não vazia, sem treino/descanso
 * registrado e sem outra atividade já substituindo o treino.
 */
export function canReplaceOn(state: GymState, date: string, today: string, excludeId?: string): boolean {
  if (date > today || !state.queue.length || !isTrainingDay(state, date)) return false
  if (state.history[date]) return false
  return !(state.activities[date] ?? []).some((a) => a.mode === 'replace' && a.id !== excludeId)
}

/* ---------- Formulário ---------- */

/** O formulário trabalha com texto (o que o usuário digita); vira Activity ao salvar. */
export type ActivityDraft = {
  date: string
  type: ActivityType
  duration: string
  distance: string
  intensity: Intensity | null
  calories: string
  notes: string
  mode: ActivityMode
}

export type ActivityErrors = Partial<Record<'duration' | 'distance' | 'calories', string>>

export function validateActivity(d: ActivityDraft): ActivityErrors {
  const errors: ActivityErrors = {}
  const duration = parseDecimal(d.duration)
  if (duration === null) errors.duration = 'Informe a duração'
  else if (!Number.isInteger(duration) || duration < 1 || duration > 1440) errors.duration = 'Entre 1 e 1440 min'

  if (d.distance.trim()) {
    const km = parseDecimal(d.distance)
    if (km === null || km <= 0 || km > 999) errors.distance = 'Distância inválida'
  }
  if (d.calories.trim()) {
    const kcal = parseDecimal(d.calories)
    if (kcal === null || !Number.isInteger(kcal) || kcal < 1 || kcal > 9999) errors.calories = 'Calorias inválidas'
  }
  return errors
}

export function draftFromActivity(date: string, a: Activity): ActivityDraft {
  return {
    date,
    type: a.type,
    duration: String(a.durationMin),
    distance: a.distanceKm !== null ? String(a.distanceKm).replace('.', ',') : '',
    intensity: a.intensity,
    calories: a.calories !== null ? String(a.calories) : '',
    notes: a.notes,
    mode: a.mode,
  }
}

export function activityFromDraft(d: ActivityDraft, base: Pick<Activity, 'id' | 'createdAt'>): Activity {
  return {
    ...base,
    type: d.type,
    durationMin: parseDecimal(d.duration) ?? 0,
    distanceKm: d.distance.trim() ? parseDecimal(d.distance) : null,
    intensity: d.intensity,
    calories: d.calories.trim() ? parseDecimal(d.calories) : null,
    notes: d.notes.trim(),
    mode: d.mode,
  }
}

/* ---------- Exibição ---------- */

export function formatDuration(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function activityDetails(a: Activity): string[] {
  const parts = [formatDuration(a.durationMin)]
  if (a.distanceKm !== null) parts.push(`${a.distanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`)
  if (a.intensity) parts.push(INTENSITY_LABELS[a.intensity])
  if (a.calories !== null) parts.push(`${a.calories} kcal`)
  return parts
}

export const totalMinutes = (state: GymState, dates: string[]) =>
  dates.reduce((sum, d) => sum + (state.activities[d] ?? []).reduce((s, a) => s + a.durationMin, 0), 0)
