/**
 * Importação rápida de treinos a partir de um JSON (normalmente gerado por uma IA).
 *
 * Formato (chaves em português, pensado para ser fácil de pedir a uma IA):
 * {
 *   "formato": "gymduda-treinos",
 *   "diasDeTreino": ["seg", "ter", "qui", "sex"],          // opcional
 *   "treinos": [
 *     { "nome": "Treino A - Peito", "foco": "Peito • Tríceps", "cor": "verde",   // foco e cor opcionais
 *       "exercicios": [
 *         { "nome": "Supino reto", "series": 4, "repeticoes": "8-10", "carga": "40kg", "obs": "..." }  // carga e obs opcionais
 *       ] }
 *   ]
 * }
 * A ordem de "treinos" vira a ordem da fila (A → B → C…).
 */
import { WORKOUT_COLORS, type Exercise, type GymState, type Workout, type WorkoutColor } from '../types'
import { uid } from '../utils'

export type ImportedPlan = { workouts: Workout[]; trainingDays: boolean[] | null }
export type ImportResult = { ok: true; plan: ImportedPlan } | { ok: false; errors: string[] }

const FORMAT = 'gymduda-treinos'
const MAX_WORKOUTS = 20
const MAX_EXERCISES = 30

const DAY_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']
const DAY_NAMES = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

const COLOR_ALIASES: Record<string, WorkoutColor> = {
  verde: 'lime',
  lima: 'lime',
  azul: 'sky',
  laranja: 'orange',
  rosa: 'pink',
  roxo: 'violet',
  violeta: 'violet',
  turquesa: 'teal',
  'verde-agua': 'teal',
}
const COLOR_NAMES: Record<WorkoutColor, string> = {
  lime: 'verde',
  sky: 'azul',
  orange: 'laranja',
  pink: 'rosa',
  violet: 'roxo',
  teal: 'turquesa',
}

export const IMPORT_EXAMPLE = {
  formato: FORMAT,
  diasDeTreino: ['seg', 'ter', 'qui', 'sex'],
  treinos: [
    {
      nome: 'Treino A - Superiores',
      foco: 'Peito • Costas • Ombros',
      cor: 'verde',
      exercicios: [
        { nome: 'Supino reto com barra', series: 4, repeticoes: '6-8', carga: '60kg', obs: 'Descer controlado' },
        { nome: 'Remada curvada com barra', series: 4, repeticoes: '8-10', carga: '50kg' },
        { nome: 'Desenvolvimento com halteres', series: 3, repeticoes: '8-10' },
        { nome: 'Rosca direta', series: 3, repeticoes: '10-12' },
      ],
    },
    {
      nome: 'Treino B - Inferiores',
      foco: 'Quadríceps • Posterior • Panturrilha',
      cor: 'laranja',
      exercicios: [
        { nome: 'Agachamento livre', series: 4, repeticoes: '6-8', obs: 'Aquecer com 2 séries leves' },
        { nome: 'Stiff com barra', series: 3, repeticoes: '8-10' },
        { nome: 'Cadeira extensora', series: 3, repeticoes: '12-15' },
        { nome: 'Panturrilha em pé', series: 4, repeticoes: '15-20' },
      ],
    },
  ],
}

export const exampleJson = () => JSON.stringify(IMPORT_EXAMPLE, null, 2)

/** Pedido pronto para colar numa IA junto com o que a pessoa quer. */
export const aiImportPrompt = () => `Monte um treino de musculação para mim e responda SOMENTE com um JSON válido, sem texto antes ou depois, exatamente neste formato:

${exampleJson()}

Regras do formato:
- "formato" deve ser sempre "${FORMAT}".
- "treinos": lista na ordem em que devem ser feitos (A, B, C…). Cada treino tem "nome" e "exercicios"; "foco" e "cor" são opcionais.
- "cor" pode ser: verde, azul, laranja, rosa, roxo ou turquesa.
- Cada exercício tem "nome", "series" (número), "repeticoes" (texto, ex.: "8-12" ou "45s") e, opcionalmente, "carga" (ex.: "40kg") e "obs".
- "diasDeTreino" (opcional): dias da semana em que vou treinar, usando seg, ter, qua, qui, sex, sab, dom.

O que eu quero: `

/** Remove crases de bloco de código e texto em volta do JSON (a IA às vezes manda). */
function extractJson(text: string) {
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function parseImport(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(extractJson(text.trim()))
  } catch {
    return { ok: false, errors: ['O texto não é um JSON válido. Confira se copiou a resposta inteira da IA.'] }
  }

  // Aceita também só a lista de treinos.
  const root = Array.isArray(raw) ? { treinos: raw } : raw
  if (!isObject(root)) return { ok: false, errors: ['O JSON precisa ser um objeto com a lista "treinos".'] }
  if (!Array.isArray(root.treinos) || !root.treinos.length) return { ok: false, errors: ['Não encontrei a lista "treinos" (ou ela está vazia).'] }
  if (root.treinos.length > MAX_WORKOUTS) return { ok: false, errors: [`No máximo ${MAX_WORKOUTS} treinos por importação.`] }

  const errors: string[] = []
  const workouts: Workout[] = []

  root.treinos.forEach((t: unknown, wi) => {
    const where = `Treino ${wi + 1}`
    if (!isObject(t)) return void errors.push(`${where}: formato inválido.`)
    const name = str(t.nome)
    if (!name) errors.push(`${where}: falta o "nome".`)
    const list = t.exercicios
    if (!Array.isArray(list) || !list.length) return void errors.push(`${where}${name ? ` (${name})` : ''}: falta a lista "exercicios".`)
    if (list.length > MAX_EXERCISES) errors.push(`${where}: no máximo ${MAX_EXERCISES} exercícios.`)

    const exercises: Exercise[] = []
    list.slice(0, MAX_EXERCISES).forEach((e: unknown, ei) => {
      const at = `${name || where}, exercício ${ei + 1}`
      if (!isObject(e)) return void errors.push(`${at}: formato inválido.`)
      const exName = str(e.nome)
      const sets = Math.round(Number(e.series))
      if (!exName) errors.push(`${at}: falta o "nome".`)
      if (!Number.isFinite(sets) || sets < 1 || sets > 20) errors.push(`${at}${exName ? ` (${exName})` : ''}: "series" deve ser um número de 1 a 20.`)
      exercises.push({
        id: uid(),
        name: exName,
        sets: Number.isFinite(sets) ? Math.min(20, Math.max(1, sets)) : 3,
        reps: str(e.repeticoes),
        load: str(e.carga),
        notes: str(e.obs),
      })
    })

    const colorKey = normalize(str(t.cor))
    const color =
      (WORKOUT_COLORS as readonly string[]).includes(colorKey)
        ? (colorKey as WorkoutColor)
        : (COLOR_ALIASES[colorKey] ?? WORKOUT_COLORS[wi % WORKOUT_COLORS.length])

    workouts.push({ id: uid(), name, focus: str(t.foco), color, exercises })
  })

  let trainingDays: boolean[] | null = null
  if (root.diasDeTreino !== undefined) {
    if (!Array.isArray(root.diasDeTreino)) errors.push('"diasDeTreino" deve ser uma lista, ex.: ["seg", "qua", "sex"].')
    else {
      trainingDays = Array(7).fill(false)
      for (const d of root.diasDeTreino) {
        const idx = DAY_KEYS.indexOf(normalize(str(d)).slice(0, 3))
        if (idx < 0) errors.push(`Dia de treino desconhecido: "${str(d)}". Use seg, ter, qua, qui, sex, sab ou dom.`)
        else trainingDays[idx] = true
      }
      if (!trainingDays.some(Boolean)) trainingDays = null
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, plan: { workouts, trainingDays } }
}

/** Treinos atuais no mesmo formato — serve de base para editar ou mandar para a IA ajustar. */
export function currentPlanJson(state: GymState) {
  const ordered = [
    ...state.queue.map((id) => state.workouts.find((w) => w.id === id)).filter((w): w is Workout => !!w),
    ...state.workouts.filter((w) => !state.queue.includes(w.id)),
  ]
  const plan = {
    formato: FORMAT,
    diasDeTreino: DAY_KEYS.filter((_, i) => state.trainingDays[i]),
    treinos: ordered.map((w) => ({
      nome: w.name,
      ...(w.focus ? { foco: w.focus } : {}),
      cor: COLOR_NAMES[w.color],
      exercicios: w.exercises.map((e) => ({
        nome: e.name,
        series: e.sets,
        repeticoes: e.reps,
        ...(e.load ? { carga: e.load } : {}),
        ...(e.notes ? { obs: e.notes } : {}),
      })),
    })),
  }
  return JSON.stringify(plan, null, 2)
}

export const formatDays = (days: boolean[]) => DAY_NAMES.filter((_, i) => days[i]).join(', ')
