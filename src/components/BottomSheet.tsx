import { X } from 'lucide-react'
import { useEffect, useId, type ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Camadas extras para sheets empilhados (ex.: exercício dentro do treino). */
  level?: 0 | 1
}

/** Bottom sheet no celular, modal centralizado a partir de `sm`. */
export function BottomSheet({ open, title, onClose, children, footer, level = 0 }: Props) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Com sheets empilhados, só o do topo fecha
      if (level === 0 && document.querySelector('[data-sheet-level="1"]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose, level])

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 flex items-end justify-center sm:items-center sm:p-6 ${level === 1 ? 'z-60' : 'z-50'}`}
      role="dialog"
      data-sheet-level={level}
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="animate-sheet-in sm:animate-pop-in relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-ink-700/60 bg-ink-900 shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-ink-600 sm:hidden" />

        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-5">
          <h2 id={titleId} className="text-lg font-bold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 grid size-11 place-items-center rounded-full text-ink-300 transition hover:bg-ink-800 hover:text-ink-100 active:scale-95"
          >
            <X size={22} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>

        {footer && (
          <footer className="shrink-0 border-t border-ink-800 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
