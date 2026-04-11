import type { SharedExpense } from '../../api/households'

export const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

export const DONUT_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ec4899', '#ef4444', '#84cc16',
  '#f97316', '#14b8a6',
]

export const AVATAR_PALETTES = [
  { bg: 'bg-violet-500/20',  text: 'text-violet-400'  },
  { bg: 'bg-cyan-500/20',    text: 'text-cyan-400'    },
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  { bg: 'bg-rose-500/20',    text: 'text-rose-400'    },
  { bg: 'bg-amber-500/20',   text: 'text-amber-400'   },
  { bg: 'bg-indigo-500/20',  text: 'text-indigo-400'  },
  { bg: 'bg-pink-500/20',    text: 'text-pink-400'    },
  { bg: 'bg-teal-500/20',    text: 'text-teal-400'    },
]

export function avatarPalette(name: string) {
  return AVATAR_PALETTES[name.charCodeAt(0) % AVATAR_PALETTES.length]
}

export function fmtNum(n: number) {
  return n.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function parseErr(err: unknown, fallback: string): string {
  const e = err as any
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  return fallback
}

export function getUserIdFromToken(token: string | null): string | null {
  if (!token) return null
  try {
    return JSON.parse(atob(token.split('.')[1])).sub ?? null
  } catch { return null }
}

export function getMemberBreakdown(expenses: SharedExpense[], userId: string) {
  const map: Record<string, number> = {}
  for (const e of expenses) {
    if (e.paid_by_user_id !== userId) continue
    map[e.category_name] = (map[e.category_name] ?? 0) + Number(e.amount)
  }
  const total = Object.values(map).reduce((a, b) => a + b, 0)
  return {
    total,
    count: expenses.filter(e => e.paid_by_user_id === userId).length,
    categories: Object.entries(map)
      .map(([name, amount]) => ({ name, amount, pct: total > 0 ? amount / total : 0 }))
      .sort((a, b) => b.amount - a.amount),
  }
}

export function categoryColor(name: string, allCategories: { category_name: string }[]): string {
  const idx = allCategories.findIndex(c => c.category_name === name)
  return idx >= 0 ? DONUT_COLORS[idx % DONUT_COLORS.length] : '#64748b'
}

export const labelClass  = 'text-xs text-slate-400 mb-1 block'
export const inputClass  = 'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60 transition-colors w-full'
export const selectClass = 'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60 transition-colors w-full appearance-none cursor-pointer'
