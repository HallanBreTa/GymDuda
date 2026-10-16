/** 'weight' = Kg · Reps · RIR (padrão); 'time' = só a duração da série (prancha, isometria…). */
export type ExerciseKind = 'weight' | 'time'

export type Exercise = {
  id: string
  name: string
  /** Ausente = 'weight' (dados antigos continuam iguais). */
  kind?: ExerciseKind
  sets: number // nº de séries prescritas
  reps: string // meta, texto livre: "10", "8-12" — em exercícios de tempo, a meta de tempo ("45s", "1:00")
  load: string // carga sugerida, texto livre: "40kg", "peso corporal"
  notes: string
  /** Descanso entre séries, em segundos. Ausente = padrão (90s); 0 = sem cronômetro. */
  restSec?: number
}

export const WORKOUT_COLORS = ['lime', 'sky', 'orange', 'pink', 'violet', 'teal'] as const
export type WorkoutColor = (typeof WORKOUT_COLORS)[number]

export type Workout = {
  id: string
  name: string
  focus: string
  color: WorkoutColor
  exercises: Exercise[]
}

/* ---------- Execução (Feature 2) ---------- */

/** Valores ficam como texto enquanto o usuário digita; validados em domain/sets.ts. */
export type SetLog = {
  load: string // kg
  reps: string
  rir: string // repetições na reserva (0 = falha)
  /** Exercícios de tempo: duração da série em segundos ("45"). */
  time?: string
  done: boolean
}

export type ExerciseLog = {
  name: string // snapshot do nome (permite achar carga anterior mesmo se o id mudar)
  /** Snapshot do tipo: histórico/estatísticas sabem que é tempo mesmo se o exercício mudar. */
  kind?: ExerciseKind
  sets: SetLog[]
}

/* ---------- Histórico / fila (Feature 1) ---------- */

export type WorkoutSession = {
  status: 'in_progress' | 'done'
  workoutId: string
  workoutName: string // snapshots: o histórico continua legível se o treino for apagado
  workoutColor: WorkoutColor
  extra: boolean // feito em dia planejado como descanso
  startedAt: number
  finishedAt?: number
  /** Registrado depois do dia (ex.: esqueceu de marcar o treino de ontem). A duração não é medida. */
  retroactive?: boolean
  /** Ponteiro da fila antes da conclusão — permite "Reabrir treino" sem bagunçar a fila. */
  pointerBefore?: number
  logs: Record<string, ExerciseLog> // chave = exerciseId
}

export type RestLog = { status: 'rest'; loggedAt: number }

export type DayLog = WorkoutSession | RestLog

/* ---------- Atividades avulsas (cardio, esportes, mobilidade) ---------- */

export const ACTIVITY_TYPES = ['cardio', 'walk', 'run', 'cycling', 'swim', 'sport', 'mobility', 'other'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export type Intensity = 'light' | 'moderate' | 'intense'

/**
 * - 'extra': complementar, não mexe na fila (cardio no sábado, cardio depois do Treino A…)
 * - 'replace': substitui o treino daquele dia; o treino pendente rola para o próximo dia de treino
 */
export type ActivityMode = 'extra' | 'replace'

export type Activity = {
  id: string
  type: ActivityType
  durationMin: number
  distanceKm: number | null
  intensity: Intensity | null
  calories: number | null
  notes: string
  mode: ActivityMode
  createdAt: number
}

export type GymState = {
  version: 3
  workouts: Workout[]
  /** Ordem da divisão (A → B → C → D). Ids de treinos; treinos fora daqui são "avulsos". */
  queue: string[]
  /** Índice em `queue` do próximo treino a ser feito. */
  pointer: number
  /** Índice 0 = Segunda ... 6 = Domingo. true = dia em que o usuário pretende treinar. */
  trainingDays: boolean[]
  /** Histórico por data ISO (yyyy-mm-dd). */
  history: Record<string, DayLog>
  /** Atividades avulsas por data ISO. Separado de `history` porque um dia pode ter treino + cardio. */
  activities: Record<string, Activity[]>
  /** Data em que o usuário começou a usar a fila — antes disso não há "faltas". */
  startDate: string
  /** Check-in diário (disposição e dor na coluna) por data ISO. Opcional: estados antigos não têm. */
  checkins?: Record<string, CheckIn>
}

/* ---------- Check-in diário ---------- */

export type Mood = 1 | 2 | 3 | 4 | 5

export type CheckIn = {
  /** Disposição: 1 = péssimo … 5 = ótimo. */
  mood: Mood | null
  /** Dor na coluna: 0 = sem dor … 10 = máxima. */
  backPain: number | null
  note: string
  updatedAt: number
}

export type Tab = 'home' | 'today' | 'workouts' | 'week' | 'stats' | 'settings'
