import type { ExchangeRate } from '../api/dashboard'

/** Tasa from→to para el mes de `date`: la del mes o la anterior más reciente; si no, la primera posterior. Soporta par inverso. */
export function findRate(rates: ExchangeRate[], from: string, to: string, date: string): number | null {
  const key = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
  const candidates = rates
    .map(r => r.from_currency === from && r.to_currency === to ? { k: r.year * 12 + r.month, rate: Number(r.rate) }
      : r.from_currency === to && r.to_currency === from ? { k: r.year * 12 + r.month, rate: 1 / Number(r.rate) }
      : null)
    .filter((c): c is { k: number; rate: number } => c !== null)
  if (candidates.length === 0) return null
  const past = candidates.filter(c => c.k <= key).sort((a, b) => b.k - a.k)
  if (past.length) return past[0].rate
  return candidates.sort((a, b) => a.k - b.k)[0].rate
}

/** "1 USD = 40.50 UYU" — siempre expresado con la moneda más fuerte a la izquierda. rate = cuántos `to` por 1 `from`. */
export function fmtRate(rate: number, from: string, to: string): string {
  return rate >= 1 ? `1 ${from} = ${rate.toFixed(2)} ${to}` : `1 ${to} = ${(1 / rate).toFixed(2)} ${from}`
}
