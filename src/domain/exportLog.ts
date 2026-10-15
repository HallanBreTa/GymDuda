/** Relatório do histórico em Markdown, pensado para colar numa IA e pedir uma avaliação. */
import { ACTIVITY_META } from '../data/activityTypes'
import type { Activity, GymState, SetLog, WorkoutSession } from '../types'
import { addDays, diffDays, parseISODate, WEEKDAYS_SHORT, weekdayOf } from '../utils'
import { activityDetails } from './activities'
import { formatSet, kindOf, sessionStats } from './sets'
import { estimated1RM } from './stats'

export type ExportOptions = {
  /** Primeiro dia incluído (yyyy-mm-dd); null = todo o histórico. */
  from: string | null
  today: string
  /** Inclui no topo um pedido de análise pronto para a IA. */
  withPrompt: boolean
}

const AI_PROMPT = `Você é um treinador de musculação. Analise meu histórico de treinos abaixo e me dê uma avaliação objetiva:
1. Progressão de carga e repetições nos principais exercícios (onde estou evoluindo, estagnado ou regredindo).
2. Volume semanal por grupo muscular (séries efetivas) e se está adequado.
3. Frequência e consistência (dias treinados x planejados).
4. Intensidade a partir do RIR (repetições na reserva): estou treinando perto o suficiente da falha?
5. Sugestões práticas e específicas para as próximas semanas (cargas, séries, exercícios, divisão).`

const fmtDate = (iso: string) => {
  const d = parseISODate(iso)
  return `${WEEKDAYS_SHORT[weekdayOf(iso)]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const fmtNumber = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

function bestSet(sets: SetLog[]) {
  return sets.reduce<SetLog | null>((best, s) => (!best || estimated1RM(s) > estimated1RM(best) ? s : best), null)
}

function activityLine(a: Activity) {
  const replaced = a.mode === 'replace' ? ' (no lugar do treino)' : ''
  const notes = a.notes.trim() ? ` — obs: ${a.notes.trim()}` : ''
  return `- Atividade: ${ACTIVITY_META[a.type].label} — ${activityDetails(a).join(', ')}${replaced}${notes}`
}

function sessionBlock(state: GymState, date: string, session: WorkoutSession) {
  const stats = sessionStats(session)
  const meta = [
    session.status === 'in_progress' ? 'em andamento' : null,
    session.extra ? 'fora dos dias planejados' : null,
    stats.minutes ? `${stats.minutes} min` : null,
    `${stats.sets} séries`,
    stats.volume ? `volume ${fmtNumber(stats.volume)} kg` : null,
  ].filter(Boolean)

  const lines = [`### ${fmtDate(date)} — ${session.workoutName} (${meta.join(', ')})`]
  // Mantém a ordem dos exercícios do treino; os que não existem mais vão no fim.
  const order = state.workouts.find((w) => w.id === session.workoutId)?.exercises.map((e) => e.id) ?? []
  const entries = Object.entries(session.logs).sort(([a], [b]) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)
  })
  for (const [, log] of entries) {
    const sets = log.sets.filter((s) => s.done)
    if (sets.length) lines.push(`- ${log.name}: ${sets.map((s) => formatSet(s, kindOf(log))).join(' | ')}`)
  }
  return lines
}

export function buildTrainingLog(state: GymState, { from, today, withPrompt }: ExportOptions): string {
  const inRange = (date: string) => date <= today && (!from || date >= from)
  const dates = [...new Set([...Object.keys(state.history), ...Object.keys(state.activities)])].filter(inRange).sort()
  const firstDate = from ?? dates[0] ?? today
  const out: string[] = []

  if (withPrompt) out.push(AI_PROMPT, '', '---', '')

  out.push(
    '# Log de treinos (GymDuda)',
    '',
    `Período: ${fmtDate(firstDate)} a ${fmtDate(today)} (${diffDays(firstDate, today) + 1} dias)`,
    '',
    'Formato das séries: carga (kg) × repetições @RIR (repetições na reserva; 0 = até a falha); exercícios de tempo: duração m:ss. Só séries concluídas.',
    '',
  )

  /* ----- Planejamento atual ----- */
  const plannedDays = WEEKDAYS_SHORT.filter((_, i) => state.trainingDays[i])
  const queueNames = state.queue.map((id) => state.workouts.find((w) => w.id === id)?.name).filter(Boolean)
  out.push(
    '## Planejamento atual',
    '',
    `- Dias de treino: ${plannedDays.join(', ') || 'nenhum definido'} (${plannedDays.length}x por semana)`,
    `- Divisão (ordem em que os treinos se repetem): ${queueNames.join(' → ') || 'nenhuma'}`,
    '',
  )
  for (const w of state.workouts) {
    out.push(`### ${w.name}${w.focus.trim() ? ` — foco: ${w.focus.trim()}` : ''}`)
    if (!w.exercises.length) out.push('- (sem exercícios)')
    for (const e of w.exercises) {
      const extras = [e.load.trim() && `carga sugerida ${e.load.trim()}`, e.notes.trim() && `obs: ${e.notes.trim()}`].filter(Boolean)
      const tag = kindOf(e) === 'time' ? ' (tempo)' : ''
      out.push(`- ${e.name}: ${e.sets} × ${e.reps || '?'}${tag}${extras.length ? ` (${extras.join('; ')})` : ''}`)
    }
    out.push('')
  }

  /* ----- Resumo ----- */
  const sessions = dates.flatMap((d) => {
    const log = state.history[d]
    return log && log.status !== 'rest' ? [[d, log] as const] : []
  })
  const done = sessions.filter(([, s]) => s.status === 'done')
  const activities = dates.flatMap((d) => state.activities[d] ?? [])
  const rests = dates.filter((d) => state.history[d]?.status === 'rest').length
  const weeks = Math.max(1, (diffDays(firstDate, today) + 1) / 7)
  out.push(
    '## Resumo do período',
    '',
    `- Treinos de musculação concluídos: ${done.length} (média de ${fmtNumber(done.length / weeks)} por semana)`,
    `- Séries concluídas: ${done.reduce((n, [, s]) => n + sessionStats(s).sets, 0)}`,
    `- Atividades avulsas (cardio, esportes etc.): ${activities.length}, total de ${activities.reduce((n, a) => n + a.durationMin, 0)} min`,
    `- Descansos registrados: ${rests}`,
    '',
  )

  /* ----- Progressão por exercício ----- */
  type Point = { date: string; set: SetLog }
  const byExercise = new Map<string, { name: string; points: Point[] }>()
  for (const [date, session] of done) {
    for (const log of Object.values(session.logs)) {
      if (kindOf(log) === 'time') continue // tabela em kg/1RM
      const best = bestSet(log.sets.filter((s) => s.done))
      if (!best) continue
      const key = log.name.trim().toLowerCase()
      const entry = byExercise.get(key) ?? { name: log.name.trim(), points: [] }
      entry.points.push({ date, set: best })
      byExercise.set(key, entry)
    }
  }
  if (byExercise.size) {
    out.push(
      '## Progressão por exercício (melhor série de cada sessão)',
      '',
      '| Exercício | Sessões | Primeira | Última | 1RM estimado (primeira → última) |',
      '|---|---|---|---|---|',
    )
    const rows = [...byExercise.values()].sort((a, b) => b.points.length - a.points.length)
    for (const { name, points } of rows) {
      const first = points[0]
      const last = points[points.length - 1]
      const rm = `${fmtNumber(estimated1RM(first.set))} → ${fmtNumber(estimated1RM(last.set))} kg`
      out.push(
        `| ${name} | ${points.length} | ${formatSet(first.set)} (${fmtDate(first.date)}) | ${formatSet(last.set)} (${fmtDate(last.date)}) | ${rm} |`,
      )
    }
    out.push('')
  }

  /* ----- Histórico ----- */
  out.push('## Histórico detalhado (do mais antigo para o mais recente)', '')
  if (!dates.length) out.push('Nenhum registro no período.', '')
  for (const date of dates) {
    const log = state.history[date]
    const dayActivities = state.activities[date] ?? []
    if (log && log.status !== 'rest') out.push(...sessionBlock(state, date, log))
    else out.push(`### ${fmtDate(date)} — ${log?.status === 'rest' ? 'Descanso' : 'Só atividades'}`)
    out.push(...dayActivities.map(activityLine), '')
  }

  return out.join('\n').trimEnd() + '\n'
}

/** Primeiro dia de um período de `days` dias terminando hoje. */
export const periodStart = (today: string, days: number) => addDays(today, -(days - 1))
