import { Check } from 'lucide-react'
import { useEffect } from 'react'

export type ToastMessage = { id: number; text: string }

/** Feedback curto de confirmação, acima da navegação inferior. */
export function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(onDone, 2400)
    return () => window.clearTimeout(t)
  }, [toast, onDone])

  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-70 flex justify-center px-4 md:bottom-8">
      <div
        key={toast.id}
        role="status"
        className="animate-toast-in flex items-center gap-2.5 rounded-full border border-ink-700 bg-ink-800/95 py-2.5 pr-5 pl-2.5 text-sm font-semibold shadow-2xl backdrop-blur"
      >
        <span className="grid size-7 place-items-center rounded-full bg-lime text-on-accent">
          <Check size={16} strokeWidth={3} />
        </span>
        {toast.text}
      </div>
    </div>
  )
}
