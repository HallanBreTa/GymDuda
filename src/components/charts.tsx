/**
 * Gráficos leves (HTML/SVG, sem biblioteca) no padrão visual do app:
 * marcas finas, grade em hairline, destaque em uma cor e o resto em cinza,
 * tooltip ao tocar/passar o mouse e sempre uma visão em tabela.
 */
import { BarChart3, Table2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { fmt, niceScale } from '../chartScale'

type Tone = 'lime' | 'coral'
const TONE_BG: Record<Tone, string> = { lime: 'bg-lime', coral: 'bg-coral' }
const TONE_HEX: Record<Tone, string> = { lime: 'var(--color-lime)', coral: 'var(--color-coral)' }

/* ---------- Cartão com alternância gráfico ↔ tabela ---------- */

export type TableData = { head: string[]; rows: (string | number)[][] }

export function ChartCard({
  title,
  subtitle,
  table,
  children,
}: {
  title: string
  subtitle?: ReactNode
  table: TableData
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section className="rounded-3xl border border-ink-800 bg-ink-900 p-4">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-400">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-label={showTable ? 'Ver gráfico' : 'Ver tabela'}
          className="grid size-9 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
        >
          {showTable ? <BarChart3 size={18} /> : <Table2 size={18} />}
        </button>
      </header>
      {showTable ? <DataTable table={table} /> : children}
    </section>
  )
}

function DataTable({ table }: { table: TableData }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[12px] text-ink-400">
            {table.head.map((h, i) => (
              <th key={h} className={`pb-2 font-semibold ${i ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {table.rows.map((row, r) => (
            <tr key={r} className="border-t border-ink-800">
              {row.map((cell, i) => (
                <td key={i} className={`py-2 ${i ? 'text-right text-ink-300' : 'font-medium'}`}>
                  {typeof cell === 'number' ? fmt(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- Tooltip ---------- */

function Tooltip({ x, value, label }: { x: number; value: string; label: string }) {
  // Mantém o balão dentro do cartão nas bordas.
  const align = x < 18 ? 'translate-x-0' : x > 82 ? '-translate-x-full' : '-translate-x-1/2'
  return (
    <div
      role="status"
      className={`pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 whitespace-nowrap shadow-xl ${align}`}
      style={{ left: `${x}%` }}
    >
      <p className="text-sm font-bold text-ink-100">{value}</p>
      <p className="text-[12px] text-ink-400">{label}</p>
    </div>
  )
}

/* ---------- Colunas ---------- */

export type Column = { label: string; value: number; tipValue: string; tipLabel: string; emphasis?: boolean }

export function ColumnChart({
  columns,
  tone = 'lime',
  height = 140,
  format = fmt,
  reference,
  labelEvery = 1,
}: {
  columns: Column[]
  tone?: Tone
  height?: number
  format?: (n: number) => string
  /** Linha de referência (ex.: meta de treinos por semana). */
  reference?: { value: number; label: string }
  labelEvery?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...columns.map((c) => c.value), reference?.value ?? 0)
  const { hi, ticks } = niceScale(0, max || 1, 3, 1)
  const anyEmphasis = columns.some((c) => c.emphasis)
  const pct = (v: number) => (v / hi) * 100

  return (
    <div className="flex gap-2 pt-5">
      {/* Eixo Y */}
      <div className="relative w-9 shrink-0 text-right text-[11px] text-ink-400 tabular-nums" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${pct(t)}%` }}>
            {format(t)}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-ink-800" style={{ bottom: `${pct(t)}%` }} />
          ))}
          {reference && reference.value > 0 && (
            <div className="absolute inset-x-0 h-px bg-ink-400" style={{ bottom: `${pct(reference.value)}%` }}>
              <span className="absolute right-0 bottom-1 rounded bg-ink-900/90 px-1 text-[11px] text-ink-300">{reference.label}</span>
            </div>
          )}

          <div className="absolute inset-0 flex">
            {columns.map((c, i) => {
              const color = !anyEmphasis || c.emphasis ? TONE_BG[tone] : 'bg-ink-600'
              const isActive = active === i
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`${c.tipLabel}: ${c.tipValue}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  <span
                    className={`relative w-[60%] max-w-6 rounded-t-[4px] transition ${color} ${isActive ? 'brightness-125' : ''} group-focus-visible:ring-2 group-focus-visible:ring-ink-100`}
                    style={{ height: `${pct(c.value)}%` }}
                  >
                    {c.emphasis && c.value > 0 && (
                      <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[12px] font-bold text-ink-100 tabular-nums">
                        {format(c.value)}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          {active !== null && (
            <Tooltip x={((active + 0.5) / columns.length) * 100} value={columns[active].tipValue} label={columns[active].tipLabel} />
          )}
        </div>

        {/* Eixo X */}
        <div className="mt-2 flex h-4 text-[11px] text-ink-400">
          {columns.map((c, i) => (
            <span key={i} className="relative flex-1">
              {i % labelEvery === 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{c.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- Barras horizontais (ranking) ---------- */

export function BarList({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0 text-ink-300 tabular-nums">{r.display}</span>
          </div>
          <div className="h-2.5 rounded-r-[4px] bg-ink-850">
            <div className="h-full rounded-r-[4px] bg-lime" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ---------- Linha (evolução) ---------- */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (ref.current) setWidth(ref.current.clientWidth)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export type LinePoint = { x: number; y: number; label: string; tipValue: string; tipLabel: string }

export function LineChart({ points, height = 170, format = fmt }: { points: LinePoint[]; height?: number; format?: (n: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const pad = { top: 12, bottom: 22, left: 40, right: 12 }

  const ys = points.map((p) => p.y)
  const { lo, hi, ticks } = niceScale(Math.min(...ys) * 0.95, Math.max(...ys), 3)
  const minX = points[0]?.x ?? 0
  const spanX = Math.max(1, (points[points.length - 1]?.x ?? 1) - minX)
  const plotW = Math.max(0, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom
  const px = (x: number) => pad.left + (points.length === 1 ? plotW / 2 : ((x - minX) / spanX) * plotW)
  const py = (y: number) => pad.top + plotH - ((y - lo) / (hi - lo)) * plotH
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x)},${py(p.y)}`).join(' ')

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(px(p.x) - x) < Math.abs(px(points[best].x) - x)) best = i
    })
    setActive(best)
  }

  const a = active !== null ? points[active] : null
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block touch-pan-y"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setActive(null)}
          role="img"
          aria-label="Evolução da carga por sessão"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={py(t)} y2={py(t)} stroke="var(--color-ink-800)" strokeWidth={1} />
              <text x={pad.left - 8} y={py(t)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--color-ink-400)">
                {format(t)}
              </text>
            </g>
          ))}
          {/* Rótulos do eixo X: primeiro e último */}
          {points.length > 0 &&
            [0, points.length - 1].filter((v, i, arr) => arr.indexOf(v) === i).map((i) => (
              <text
                key={i}
                x={px(points[i].x)}
                y={height - 4}
                textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}
                fontSize={11}
                fill="var(--color-ink-400)"
              >
                {points[i].label}
              </text>
            ))}
          {a && <line x1={px(a.x)} x2={px(a.x)} y1={pad.top} y2={pad.top + plotH} stroke="var(--color-ink-600)" strokeWidth={1} />}
          <path d={path} fill="none" stroke={TONE_HEX.lime} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={px(p.x)}
              cy={py(p.y)}
              r={i === active ? 6 : 4}
              fill={TONE_HEX.lime}
              stroke="var(--color-ink-900)"
              strokeWidth={2}
            />
          ))}
        </svg>
      )}
      {a && width > 0 && (
        <div className="pointer-events-none absolute inset-x-0" style={{ top: py(a.y) - 6 }}>
          <Tooltip x={(px(a.x) / width) * 100} value={a.tipValue} label={a.tipLabel} />
        </div>
      )}
    </div>
  )
}
