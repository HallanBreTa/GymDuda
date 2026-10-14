import { useCallback, useState } from 'react'
import { ActivityForm } from './components/ActivityForm'
import { BottomNav, Logo, TopBar } from './components/Navigation'
import { Toast, type ToastMessage } from './components/Toast'
import { WorkoutEditor } from './components/WorkoutEditor'
import { useGymStore } from './hooks/useGymStore'
import { useToday } from './hooks/useToday'
import type { Activity, Tab, Workout } from './types'
import { TodayView } from './views/TodayView'
import { WeekView } from './views/WeekView'
import { WorkoutsView } from './views/WorkoutsView'

/** Editor aberto: `workout` null = criar novo. */
type EditorState = { workout: Workout | null } | null

/** Formulário de atividade aberto: `editing` null = nova atividade em `defaultDate`. */
type ActivityFormState = { editing: { date: string; activity: Activity } | null; defaultDate: string } | null

function nextWorkoutName(count: number) {
  return count < 26 ? `Treino ${String.fromCharCode(65 + count)} - ` : ''
}

export default function App() {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  // Outro aparelho salvou antes: avisa que os dados locais foram trocados pelos da nuvem.
  const store = useGymStore({ onSyncReplaced: () => setToast({ id: Date.now(), text: 'Dados atualizados com a versão da nuvem' }) })
  const { state } = store
  const today = useToday()

  const [tab, setTab] = useState<Tab>('today')
  const [editor, setEditor] = useState<EditorState>(null)
  const [activityForm, setActivityForm] = useState<ActivityFormState>(null)
  const [highlightActivityId, setHighlightActivityId] = useState<string>()
  const clearToast = useCallback(() => setToast(null), [])
  // Data selecionada na aba Hoje. Guarda também qual era "hoje" na hora da seleção:
  // se o dia virar com o app aberto, quem estava vendo "hoje" passa para o novo dia.
  const [selection, setSelection] = useState({ date: today, madeOn: today })
  const selectedDate = selection.madeOn !== today && selection.date === selection.madeOn ? today : selection.date
  const selectDate = (date: string) => setSelection({ date, madeOn: today })

  const changeTab = (next: Tab) => {
    setTab(next)
    window.scrollTo({ top: 0 })
  }

  const openNewActivity = (date: string) => setActivityForm({ editing: null, defaultDate: date })
  const openEditActivity = (date: string, activity: Activity) => setActivityForm({ editing: { date, activity }, defaultDate: date })

  const saveActivity = (date: string, activity: Activity, previousDate?: string) => {
    const isNew = !activityForm?.editing
    store.saveActivity(date, activity, today, previousDate)
    setHighlightActivityId(activity.id)
    // Leva o usuário para o dia salvo (útil quando escolheu "ontem" ou outra data).
    selectDate(date)
    if (tab !== 'today') changeTab('today')
    setToast({
      id: Date.now(),
      text: isNew ? (activity.mode === 'replace' ? 'Atividade registrada no lugar do treino' : 'Atividade registrada') : 'Atividade atualizada',
    })
  }

  return (
    <>
      <TopBar tab={tab} onChange={changeTab} />

      <main className="mx-auto max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 md:pt-8 md:pb-12">
        <div className="mb-5 md:hidden">
          <Logo />
        </div>

        {tab === 'today' && (
          <TodayView
            store={store}
            today={today}
            selectedDate={selectedDate}
            onSelectDate={selectDate}
            onEditWorkout={(workout) => setEditor({ workout })}
            onAddActivity={openNewActivity}
            onEditActivity={openEditActivity}
            highlightActivityId={highlightActivityId}
          />
        )}
        {tab === 'workouts' && (
          <WorkoutsView
            state={state}
            today={today}
            sync={store.sync}
            onCreate={() => setEditor({ workout: null })}
            onEdit={(workout) => setEditor({ workout })}
            onDelete={store.deleteWorkout}
            onApplyTemplate={store.applyTemplate}
          />
        )}
        {tab === 'week' && (
          <WeekView
            store={store}
            today={today}
            onOpenDay={(date) => {
              selectDate(date)
              changeTab('today')
            }}
            onAddActivity={openNewActivity}
          />
        )}
      </main>

      <BottomNav tab={tab} onChange={changeTab} />

      {editor && (
        <WorkoutEditor
          workout={editor.workout}
          suggestedName={nextWorkoutName(state.workouts.length)}
          onSave={store.saveWorkout}
          onDelete={store.deleteWorkout}
          onClose={() => setEditor(null)}
        />
      )}

      {activityForm && (
        <ActivityForm
          state={state}
          today={today}
          editing={activityForm.editing}
          defaultDate={activityForm.defaultDate}
          onSave={saveActivity}
          onDelete={(date, id) => {
            store.deleteActivity(date, id)
            setToast({ id: Date.now(), text: 'Atividade excluída' })
          }}
          onClose={() => setActivityForm(null)}
        />
      )}

      <Toast toast={toast} onDone={clearToast} />
    </>
  )
}
