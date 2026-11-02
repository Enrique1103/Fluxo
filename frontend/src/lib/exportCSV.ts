import type { MonthlyTx } from '../api/dashboard'
import type { SharedExpense, MemberTransfer } from '../api/households'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmtAmt(n: number) {
  return n.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(c => {
    const s = String(c ?? '')
    return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(';')
}

function download(content: string, filename: string) {
  const bom = '﻿'
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const TYPE_LABEL: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
}

export function exportTransactionsCSV(
  transactions: MonthlyTx[],
  year: number,
  month: number,
) {
  const monthName = MONTH_NAMES[month - 1] ?? String(month)
  const header = csvRow(['Fecha','Tipo','Concepto','Categoría','Cuenta','Destino','Método de pago','Monto','Descripción'])
  const rows = transactions.map(t => csvRow([
    fmtDate(t.date),
    TYPE_LABEL[t.type] ?? t.type,
    t.concept_name,
    t.category_name,
    t.account_name,
    t.transfer_dest_name ?? '',
    t.metodo_pago ?? '',
    fmtAmt(t.amount),
    t.description ?? '',
  ]))
  download([header, ...rows].join('\n'), `fluxo-movimientos-${monthName}-${year}.csv`)
}

export function exportSharedExpensesCSV(
  expenses: SharedExpense[],
  year: number,
  month: number,
  householdName: string,
) {
  const monthName = MONTH_NAMES[month - 1] ?? String(month)
  const header = csvRow(['Fecha','Concepto','Categoría','Pagado por','Cuenta','Monto','Moneda','Descripción'])
  const rows = expenses.map(e => csvRow([
    fmtDate(e.date),
    e.concept_name,
    e.category_name,
    e.paid_by_user_name,
    e.account_name,
    fmtAmt(e.amount),
    e.currency,
    e.description ?? '',
  ]))
  const safe = householdName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-]/g, '').trim().replace(/\s+/g, '-')
  download([header, ...rows].join('\n'), `fluxo-hogar-${safe}-${monthName}-${year}.csv`)
}

export function exportMemberTransfersCSV(
  transfers: MemberTransfer[],
  year: number,
  month: number,
  householdName: string,
) {
  const monthName = MONTH_NAMES[month - 1] ?? String(month)
  const header = csvRow(['Fecha','De','Para','Monto','Moneda','Descripción'])
  const rows = transfers.map(t => csvRow([
    fmtDate(t.date),
    t.from_user_name ?? '',
    t.to_user_name ?? '',
    fmtAmt(Number(t.amount)),
    t.currency,
    t.description ?? '',
  ]))
  const safe = householdName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-]/g, '').trim().replace(/\s+/g, '-')
  download([header, ...rows].join('\n'), `fluxo-transferencias-${safe}-${monthName}-${year}.csv`)
}
