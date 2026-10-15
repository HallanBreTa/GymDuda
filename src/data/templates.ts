import type { Exercise, ExerciseKind, GymState, Workout, WorkoutColor } from '../types'
import { todayISO, uid } from '../utils'

type ExSeed = [name: string, sets: number, reps: string, load?: string, notes?: string, kind?: ExerciseKind]

const ex = ([name, sets, reps, load = '', notes = '', kind]: ExSeed): Exercise => ({
  id: uid(),
  name,
  ...(kind === 'time' && { kind }),
  sets,
  reps,
  load,
  notes,
})

const workout = (name: string, focus: string, color: WorkoutColor, list: ExSeed[]): Workout => ({
  id: uid(),
  name,
  focus,
  color,
  exercises: list.map(ex),
})

const CHEST: ExSeed[] = [
  ['Supino reto com barra', 4, '8-10', '', 'Descer controlado até o peito'],
  ['Supino inclinado com halteres', 3, '10-12'],
  ['Crucifixo na máquina (peck deck)', 3, '12-15'],
]
const BACK: ExSeed[] = [
  ['Puxada frontal', 4, '10-12'],
  ['Remada curvada com barra', 4, '8-10'],
  ['Remada baixa no cabo', 3, '10-12'],
]
const SHOULDERS: ExSeed[] = [
  ['Desenvolvimento com halteres', 4, '8-10'],
  ['Elevação lateral', 4, '12-15'],
  ['Crucifixo inverso', 3, '12-15'],
]
const TRICEPS: ExSeed[] = [
  ['Tríceps na polia (corda)', 3, '12'],
  ['Tríceps francês', 3, '10-12'],
]
const BICEPS: ExSeed[] = [
  ['Rosca direta com barra', 3, '10'],
  ['Rosca martelo', 3, '12'],
]
const QUADS: ExSeed[] = [
  ['Agachamento livre', 4, '6-8', '', 'Aquecer com 2 séries leves'],
  ['Leg press 45°', 4, '10-12'],
  ['Cadeira extensora', 3, '12-15'],
]
const HAMS: ExSeed[] = [
  ['Stiff com barra', 4, '8-10'],
  ['Mesa flexora', 3, '10-12'],
  ['Elevação pélvica', 3, '10-12'],
]
const CALVES: ExSeed[] = [['Panturrilha em pé', 4, '15-20']]
const ABS: ExSeed[] = [['Prancha abdominal', 3, '45s', '', '', 'time']]

type Plan = Pick<GymState, 'workouts' | 'queue' | 'trainingDays'>

/**
 * `days` marca os dias de treino (Seg..Dom). A ordem dos treinos na fila é a ordem
 * do array — quem decide o treino de cada dia é a fila, não o dia da semana.
 */
const build = (workouts: Workout[], days: (0 | 1)[]): Plan => ({
  workouts,
  queue: workouts.map((w) => w.id),
  trainingDays: days.map(Boolean),
})

export type Template = { key: string; label: string; description: string; create: () => Plan }

export const TEMPLATES: Template[] = [
  {
    key: 'ABC',
    label: 'ABC',
    description: 'Push / Pull / Legs — 6x por semana',
    create: () =>
      build(
        [
          workout('Treino A - Peito, Ombro e Tríceps', 'Empurrar', 'lime', [...CHEST, SHOULDERS[0], SHOULDERS[1], ...TRICEPS]),
          workout('Treino B - Costas e Bíceps', 'Puxar', 'sky', [...BACK, SHOULDERS[2], ...BICEPS]),
          workout('Treino C - Pernas', 'Inferiores', 'orange', [...QUADS, HAMS[0], HAMS[1], ...CALVES]),
        ],
        [1, 1, 1, 1, 1, 1, 0],
      ),
  },
  {
    key: 'ABCD',
    label: 'ABCD',
    description: 'Divisão clássica em 4 dias',
    create: () =>
      build(
        [
          workout('Treino A - Peito e Tríceps', 'Peito • Tríceps', 'lime', [...CHEST, ...TRICEPS]),
          workout('Treino B - Costas e Bíceps', 'Costas • Bíceps', 'sky', [...BACK, ...BICEPS]),
          workout('Treino C - Pernas', 'Quadríceps • Posterior • Panturrilha', 'orange', [...QUADS, HAMS[0], HAMS[1], ...CALVES]),
          workout('Treino D - Ombros e Abdômen', 'Ombros • Core', 'violet', [...SHOULDERS, ...ABS]),
        ],
        [1, 1, 0, 1, 1, 0, 0],
      ),
  },
  {
    key: 'ABCDE',
    label: 'ABCDE',
    description: 'Um grupo muscular por dia — 5 dias',
    create: () =>
      build(
        [
          workout('Treino A - Peito', 'Peito', 'lime', [...CHEST, ['Crossover', 3, '12-15']]),
          workout('Treino B - Costas', 'Costas', 'sky', [...BACK, ['Pulldown com corda', 3, '12-15']]),
          workout('Treino C - Pernas', 'Inferiores', 'orange', [...QUADS, ...HAMS, ...CALVES]),
          workout('Treino D - Ombros', 'Ombros', 'violet', [...SHOULDERS, ['Encolhimento com halteres', 3, '12']]),
          workout('Treino E - Braços e Abdômen', 'Bíceps • Tríceps • Core', 'pink', [...BICEPS, ...TRICEPS, ...ABS]),
        ],
        [1, 1, 1, 1, 1, 0, 0],
      ),
  },
  {
    key: 'FULLBODY',
    label: 'Full Body',
    description: 'Corpo inteiro — 3x por semana',
    create: () =>
      build(
        [
          workout('Full Body A', 'Corpo inteiro', 'lime', [QUADS[0], CHEST[0], BACK[1], SHOULDERS[0], BICEPS[0], ABS[0]]),
          workout('Full Body B', 'Corpo inteiro', 'teal', [HAMS[0], CHEST[1], BACK[0], SHOULDERS[1], TRICEPS[0], CALVES[0]]),
        ],
        [1, 0, 1, 0, 1, 0, 0],
      ),
  },
]

export const createInitialState = (): GymState => ({
  version: 3,
  ...TEMPLATES[1].create(), // ABCD por padrão
  pointer: 0,
  history: {},
  activities: {},
  startDate: todayISO(),
})
