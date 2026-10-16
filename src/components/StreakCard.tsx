import { Coins, Flame, ShoppingBag, Snowflake } from 'lucide-react'
import { useState } from 'react'
import {
  canBuyFreeze,
  COINS_PER_DAY,
  COINS_REST_EXTRA,
  FREEZE_PRICE,
  MAX_FREEZES,
  MILESTONES,
  type StreakResult,
} from '../domain/streak'
import type { FreezePurchase } from '../types'
import { formatShortDate } from '../utils'
import { BottomSheet } from './BottomSheet'
import { Button } from './ui'

const TODAY_TEXT: Record<StreakResult['today'], string> = {
  kept: '✓ Sequência garantida hoje',
  pending: 'Treine hoje para manter a sequência',
  rest: 'Hoje é descanso',
  rest_active: `Hoje é descanso · +${COINS_REST_EXTRA} moedas pelo extra`,
}

const daysWord = (n: number) => (n === 1 ? 'dia' : 'dias')

/** Card da sequência (topo da aba Início) com o atalho para a loja de congelamentos. */
export function StreakCard({ streak, purchases, onBuy }: { streak: StreakResult; purchases: FreezePurchase[]; onBuy: () => void }) {
  const [shopOpen, setShopOpen] = useState(false)
  const m = streak.nextMilestone
  const on = streak.current > 0

  return (
    <section className="rounded-3xl border border-ink-800 bg-ink-900 p-4">
      <div className="flex items-center gap-3">
        <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${on ? 'bg-orange-400/15 text-orange-400' : 'bg-ink-800 text-ink-400'}`}>
          <Flame size={30} fill={on ? 'currentColor' : 'none'} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-3xl leading-none font-black tabular-nums">
            {streak.current}{' '}
            <span className="text-base font-bold text-ink-300">{streak.current === 1 ? 'dia seguido' : 'dias seguidos'}</span>
          </p>
          <p className="mt-1 text-[13px] text-ink-400">
            {streak.best > 0 ? `Melhor: ${streak.best} ${daysWord(streak.best)}` : 'Treine num dia proposto para começar sua sequência'}
          </p>
        </div>
      </div>

      <p
        className={`mt-3 text-[13px] font-semibold ${
          streak.today === 'kept' ? 'text-accent' : streak.today === 'pending' ? 'text-orange-400' : 'text-ink-300'
        }`}
      >
        {TODAY_TEXT[streak.today]}
      </p>
      {streak.lastBreak && (
        <p className="mt-1 text-[13px] text-ink-400">
          Sua sequência de {streak.lastBreak.length} {daysWord(streak.lastBreak.length)} acabou em {formatShortDate(streak.lastBreak.date)}.
        </p>
      )}

      {m && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between gap-2 text-[12px] text-ink-400">
            <span>Próximo marco: {m.at} dias</span>
            <span>
              faltam {m.remaining} · +{m.bonus} moedas
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-orange-400" style={{ width: `${(streak.current / m.at) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink-850 px-3 text-sm font-bold tabular-nums" aria-label={`${streak.balance} moedas`}>
          <Coins size={17} className="text-amber-400" /> {streak.balance}
        </span>
        <span
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink-850 px-3 text-sm font-bold tabular-nums"
          aria-label={`${streak.freezes} de ${MAX_FREEZES} congelamentos`}
        >
          <Snowflake size={17} className="text-sky-400" /> {streak.freezes}/{MAX_FREEZES}
        </span>
        <button
          type="button"
          onClick={() => setShopOpen(true)}
          className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl bg-lime px-4 text-sm font-bold text-on-accent transition active:scale-95"
        >
          <ShoppingBag size={17} /> Loja
        </button>
      </div>

      <ShopSheet open={shopOpen} streak={streak} purchases={purchases} onBuy={onBuy} onClose={() => setShopOpen(false)} />
    </section>
  )
}

function ShopSheet({
  open,
  streak,
  purchases,
  onBuy,
  onClose,
}: {
  open: boolean
  streak: StreakResult
  purchases: FreezePurchase[]
  onBuy: () => void
  onClose: () => void
}) {
  const check = canBuyFreeze(streak)
  const frozenDays = Object.keys(streak.days)
    .filter((d) => streak.days[d].outcome === 'frozen')
    .reverse()
    .slice(0, 5)
  const recent = [...purchases].sort((a, b) => b.at - a.at).slice(0, 5)
  const milestones = Object.entries(MILESTONES)
    .map(([at, bonus]) => `${at} (+${bonus})`)
    .join(', ')

  return (
    <BottomSheet open={open} title="Loja" onClose={onClose}>
      <div className="space-y-5">
        <p className="flex items-center gap-2 text-[15px] font-bold">
          <Coins size={18} className="text-amber-400" /> {streak.balance} moedas
        </p>

        <div>
          <div className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-850 p-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-sky-400/15 text-sky-400">
              <Snowflake size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">Congelamento</p>
              <p className="text-[13px] text-ink-400">
                Estoque: {streak.freezes}/{MAX_FREEZES}
              </p>
            </div>
            <Button onClick={onBuy} disabled={!check.ok} className="min-h-11 px-4">
              <Coins size={16} /> {FREEZE_PRICE}
            </Button>
          </div>
          {!check.ok && (
            <p className="mt-2 text-[13px] text-ink-400">
              {check.reason === 'full' ? `Estoque cheio (máx. ${MAX_FREEZES})` : `Faltam ${check.missing} moedas`}
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-ink-850 p-3 text-[13px] leading-relaxed text-ink-300">
          <p className="mb-1 font-bold text-ink-100">Como funciona</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Dia de treino cumprido (treino ou atividade no lugar dele): +1 na sequência e +{COINS_PER_DAY} moedas.</li>
            <li>Treino ou atividade num dia de descanso: +{COINS_REST_EXTRA} moedas.</li>
            <li>Bônus ao chegar a {milestones} dias seguidos.</li>
            <li>Faltou num dia de treino? Um congelamento é usado sozinho e a sequência continua. Sem congelamento, ela zera.</li>
            <li>O congelamento vale a partir do dia da compra: não salva uma falta que já passou.</li>
          </ul>
        </div>

        {(recent.length > 0 || frozenDays.length > 0) && (
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <p className="mb-1 font-semibold text-ink-300">Compras</p>
              {recent.length ? (
                recent.map((p) => (
                  <p key={p.id} className="text-ink-400">
                    {formatShortDate(p.date)}
                  </p>
                ))
              ) : (
                <p className="text-ink-600">—</p>
              )}
            </div>
            <div>
              <p className="mb-1 font-semibold text-ink-300">Usados em</p>
              {frozenDays.length ? (
                frozenDays.map((d) => (
                  <p key={d} className="text-ink-400">
                    {formatShortDate(d)}
                  </p>
                ))
              ) : (
                <p className="text-ink-600">—</p>
              )}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
