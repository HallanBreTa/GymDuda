import { BellRing, Check, Timer, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatClock } from '../domain/rest'
import type { RestTimerControls } from '../hooks/useRestTimer'

/**
 * Barra do cronômetro de descanso. Fica no TOPO da tela: no celular o teclado
 * (para digitar a próxima série) cobre a parte de baixo.
 */
export function RestTimerBar({ rest }: { rest: RestTimerControls }) {
  const { timer, remainingSec, finished } = rest
  if (!timer) return null

  const pct = finished ? 100 : Math.min(100, ((timer.totalSec - remainingSec) / timer.totalSec) * 100)
  const almost = !finished && remainingSec <= 10

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-45 flex justify-center px-3 md:top-20">
      <div
        role="timer"
        aria-live={finished ? 'assertive' : 'off'}
        className={`animate-toast-in pointer-events-auto relative w-full max-w-md overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-xl ${
          finished ? 'border-lime bg-lime text-on-accent' : 'border-ink-700 bg-ink-850/95'
        }`}
      >
        {/* Progresso como fundo */}
        {!finished && (
          <div
            className={`absolute inset-y-0 left-0 transition-[width] duration-300 ease-linear ${almost ? 'bg-amber-400/15' : 'bg-lime/10'}`}
            style={{ width: `${pct}%` }}
          />
        )}

        <div className="relative p-3.5">
          {finished ? (
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-on-accent/10">
                <BellRing size={22} className="animate-pulse" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-black">Descanso concluído!</p>
                <p className="truncate text-sm font-medium text-on-accent/75">Bora para a próxima série · {timer.exerciseName}</p>
              </div>
              <button
                type="button"
                onClick={rest.skip}
                aria-label="Fechar aviso"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-on-accent/10 transition active:scale-90"
              >
                <Check size={20} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Timer size={20} className={`shrink-0 ${almost ? 'text-amber-300' : 'text-accent'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{timer.exerciseName}</p>
                  <p className="truncate text-xs text-ink-400">{timer.setLabel} concluída · descanse</p>
                </div>
                <span className={`text-4xl leading-none font-black tabular-nums ${almost ? 'text-amber-300' : ''}`}>
                  {formatClock(remainingSec)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <TimerButton label="Menos 15 segundos" onClick={() => rest.adjust(-15)}>
                  −15s
                </TimerButton>
                <TimerButton label="Mais 15 segundos" onClick={() => rest.adjust(15)}>
                  +15s
                </TimerButton>
                <TimerButton label="Pular descanso" onClick={rest.skip}>
                  <X size={15} strokeWidth={2.5} /> Pular
                </TimerButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TimerButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-ink-950/50 text-sm font-semibold text-ink-100 transition hover:bg-ink-950/80 active:scale-95"
    >
      {children}
    </button>
  )
}
