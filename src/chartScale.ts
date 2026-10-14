/** Formatação e escalas usadas pelos gráficos da aba Dados. */

export const fmt = (n: number, digits = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: digits })

/** Formato compacto para eixos: 1.200 → 1,2 mil. */
export const fmtCompact = (n: number) =>
  n >= 1000 ? `${fmt(n / 1000)} mil` : fmt(n)

/** Escala "redonda" para o eixo Y: passos de 1, 2, 2,5 ou 5 × 10^k. */
export function niceScale(min: number, max: number, count = 4, minStep = 0) {
  if (max <= min) max = min + 1
  const rough = (max - min) / count
  const pow = 10 ** Math.floor(Math.log10(rough))
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough)!
  // Contagens (minStep 1) não podem ter passo fracionado: 2,5 → 3.
  const step = minStep >= 1 ? Math.max(minStep, Math.ceil(nice)) : nice
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return { lo, hi, ticks }
}
