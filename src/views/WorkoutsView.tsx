import { ChevronRight, Dumbbell, LayoutGrid, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SyncIcon, SyncSheet } from '../components/SyncSheet'
import { Button, EmptyState, WorkoutBadge } from '../components/ui'
import { TEMPLATES, type Template } from '../data/templates'
import { SYNC_LABELS, type CloudSync } from '../hooks/useCloudSync'
import type { GymState, Workout } from '../types'

type Props = {
  state: GymState
  sync: CloudSync
  onCreate: () => void
  onEdit: (workout: Workout) => void
  onDelete: (id: string) => void
  onApplyTemplate: (key: string) => void
}

export function WorkoutsView({ state, sync, onCreate, onEdit, onDelete, onApplyTemplate }: Props) {
  const [toDelete, setToDelete] = useState<Workout | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateToApply, setTemplateToApply] = useState<Template | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)

  const nextId = state.queue[state.pointer]

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-400">{state.workouts.length} treinos cadastrados</p>
          <h1 className="text-3xl font-black tracking-tight">Meus treinos</h1>
        </div>
        <Button onClick={onCreate} className="h-11 min-h-11 px-4">
          <Plus size={18} strokeWidth={2.5} /> Novo
        </Button>
      </header>

      <button
        type="button"
        onClick={() => setTemplatesOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 p-4 text-left transition hover:border-ink-700 active:scale-[0.99]"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-sky-400/12 text-sky-400">
          <LayoutGrid size={20} />
        </span>
        <div className="flex-1">
          <p className="font-semibold">Trocar divisão</p>
          <p className="text-[13px] text-ink-400">ABC, ABCD, ABCDE ou Full Body prontos</p>
        </div>
        <ChevronRight size={20} className="text-ink-400" />
      </button>

      <button
        type="button"
        onClick={() => setSyncOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 p-4 text-left transition hover:border-ink-700 active:scale-[0.99]"
      >
        <span className={`grid size-11 place-items-center rounded-xl bg-ink-800 ${SYNC_LABELS[sync.status].tone}`}>
          <SyncIcon status={sync.status} />
        </span>
        <div className="flex-1">
          <p className="font-semibold">Sincronização</p>
          <p className="text-[13px] text-ink-400">{SYNC_LABELS[sync.status].text}</p>
        </div>
        <ChevronRight size={20} className="text-ink-400" />
      </button>

      {state.workouts.length === 0 ? (
        <EmptyState
          icon={<Dumbbell size={24} />}
          title="Nenhum treino ainda"
          text="Crie seu primeiro treino ou escolha uma divisão pronta para começar."
          action={<Button onClick={onCreate}>Criar treino</Button>}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {state.workouts.map((w) => {
            const position = state.queue.indexOf(w.id)
            return (
              <li key={w.id} className="relative">
                <button
                  type="button"
                  onClick={() => onEdit(w)}
                  className="flex h-full w-full flex-col rounded-3xl border border-ink-800 bg-ink-900 p-4 text-left transition hover:border-ink-700 active:scale-[0.99]"
                >
                  <div className="flex items-start gap-3 pr-10">
                    <WorkoutBadge name={w.name} color={w.color} />
                    <div className="min-w-0">
                      <p className="leading-tight font-bold">{w.name}</p>
                      <p className="mt-0.5 truncate text-[13px] text-ink-400">{w.focus || 'Sem foco definido'}</p>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-2 text-[13px] text-ink-300">
                    {w.exercises.length
                      ? w.exercises.map((e) => e.name).join(' · ')
                      : 'Nenhum exercício — toque para adicionar'}
                  </p>

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                    <span className="rounded-full bg-ink-800 px-2.5 py-1 text-xs font-semibold text-ink-300">
                      {w.exercises.length} exercícios
                    </span>
                    {position >= 0 ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          w.id === nextId ? 'bg-lime text-ink-950' : 'bg-lime/10 text-lime'
                        }`}
                      >
                        {w.id === nextId ? 'Próximo' : `${position + 1}º na fila`}
                      </span>
                    ) : (
                      <span className="px-1 text-xs text-ink-400">Fora da fila</span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Excluir ${w.name}`}
                  onClick={() => setToDelete(w)}
                  className="absolute top-3 right-3 grid size-10 place-items-center rounded-xl text-ink-400 transition hover:bg-red-500/15 hover:text-red-400"
                >
                  <Trash2 size={18} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir treino?"
        message={`"${toDelete?.name}" será removido e sairá da fila. Treinos já concluídos continuam no histórico.`}
        confirmLabel="Excluir"
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && onDelete(toDelete.id)}
      />

      <BottomSheet open={templatesOpen} title="Escolher divisão" onClose={() => setTemplatesOpen(false)}>
        <p className="mb-4 text-sm text-ink-400">
          Carrega treinos, fila e dias de treino prontos. Você pode personalizar tudo depois.
        </p>
        <ul className="space-y-2">
          {TEMPLATES.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => setTemplateToApply(t)}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-ink-850 p-3 text-left transition hover:bg-ink-800 active:scale-[0.99]"
              >
                <span className="grid h-11 min-w-11 place-items-center rounded-xl bg-lime/12 px-2 text-sm font-black text-lime">
                  {t.label === 'Full Body' ? 'FB' : t.label}
                </span>
                <div className="flex-1">
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-[13px] text-ink-400">{t.description}</p>
                </div>
                <ChevronRight size={18} className="text-ink-400" />
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <SyncSheet sync={sync} open={syncOpen} onClose={() => setSyncOpen(false)} />

      <ConfirmDialog
        open={templateToApply !== null}
        title={`Usar divisão ${templateToApply?.label ?? ''}?`}
        message="Seus treinos, a fila e os dias de treino serão substituídos. O histórico de treinos concluídos é mantido (e a carga anterior é reconhecida pelo nome do exercício)."
        confirmLabel="Substituir"
        onClose={() => setTemplateToApply(null)}
        onConfirm={() => {
          if (templateToApply) onApplyTemplate(templateToApply.key)
          setTemplatesOpen(false)
        }}
      />
    </div>
  )
}
