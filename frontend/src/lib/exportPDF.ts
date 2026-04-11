/**
 * exportPDF.ts — Generador de reportes PDF para Fluxo
 * Usa html2canvas para capturar charts reales + jsPDF + autoTable para el layout.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import type { MonthlyBreakdown } from '../api/dashboard'
import type { HouseholdAnalytics, HouseholdMember } from '../api/households'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GlobalExportData {
  netWorth:     number
  totalAssets:  number
  totalDebt:    number
  income:       number
  expenses:     number
  savings:      number
  accounts:     { name: string; type: string; balance: number; currency: string }[]
  goals:        { name: string; current: number; target: number; deadline?: string }[]
  currency:     string
  userName?:    string
}

export interface MonthlyExportData {
  breakdown: MonthlyBreakdown
  year:      number
  month:     number
  currency:  string
  userName?: string
}

export interface HouseholdExportData {
  analytics:     HouseholdAnalytics
  members:       HouseholdMember[]
  householdName: string
  month:         number
  year:          number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Color palette (RGB tuples)
const C = {
  dark:     [2,   8,   23]  as [number,number,number], // slate-950
  card:     [15,  23,  42]  as [number,number,number], // slate-900
  border:   [30,  41,  59]  as [number,number,number], // slate-800
  muted:    [100, 116, 139] as [number,number,number], // slate-500
  light:    [226, 232, 240] as [number,number,number], // slate-200
  white:    [255, 255, 255] as [number,number,number],
  indigo:   [99,  102, 241] as [number,number,number], // indigo-500
  indigoDk: [67,  56,  202] as [number,number,number], // indigo-700
  emerald:  [16,  185, 129] as [number,number,number], // emerald-500
  rose:     [244, 63,  94]  as [number,number,number], // rose-500
  cyan:     [6,   182, 212] as [number,number,number], // cyan-500
  amber:    [245, 158, 11]  as [number,number,number], // amber-500
  violet:   [139, 92,  246] as [number,number,number], // violet-500
  bgPage:   [248, 250, 252] as [number,number,number], // slate-50 (PDF body)
}

function fmt(n: number, currency = 'UYU') {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency', currency,
    maximumFractionDigits: 0, currencyDisplay: 'narrowSymbol',
  }).format(n)
}

function fmtShort(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// ─── Chart capture ────────────────────────────────────────────────────────────

async function captureChart(id: string): Promise<string | null> {
  const el = document.getElementById(id)
  if (!el) return null
  try {
    const canvas = await html2canvas(el, {
      scale:           2,
      useCORS:         true,
      backgroundColor: '#0f172a',
      logging:         false,
      removeContainer: true,
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

// Draws a donut chart onto an off-screen canvas and returns a PNG data URL.
// Uses white background so it integrates cleanly into the light-themed PDF.
function createDonutChartDataUrl(
  categories: { name: string; total: number }[],
  colors:     [number, number, number][],
  total:      number,
  size = 300,
): string {
  const canvas  = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx     = canvas.getContext('2d')!
  const cx      = size / 2
  const cy      = size / 2
  const outerR  = size * 0.42
  const innerR  = size * 0.21

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  let startAngle = -Math.PI / 2
  const slices   = categories.filter(c => c.total > 0)

  slices.forEach((cat, i) => {
    const endAngle = startAngle + (cat.total / total) * 2 * Math.PI
    const [r, g, b] = colors[i % colors.length]
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, outerR, startAngle, endAngle)
    ctx.closePath()
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fill()
    // Thin white divider between slices
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth   = 1.5
    ctx.stroke()
    startAngle = endAngle
  })

  // Donut hole
  ctx.beginPath()
  ctx.arc(cx, cy, innerR, 0, 2 * Math.PI)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  return canvas.toDataURL('image/png')
}

// ─── PDF Helpers ──────────────────────────────────────────────────────────────

function addCover(
  doc:      jsPDF,
  title:    string,
  subtitle: string,
  period:   string,
  userName?: string,
) {
  const W = doc.internal.pageSize.getWidth()
  const COVER_H = 82

  // Dark background
  doc.setFillColor(...C.dark)
  doc.rect(0, 0, W, COVER_H, 'F')

  // Indigo gradient stripe at top (simulated with two rects)
  doc.setFillColor(...C.indigo)
  doc.rect(0, 0, W, 3.5, 'F')
  doc.setFillColor(...C.indigoDk)
  doc.rect(0, 3.5, W, 1.5, 'F')

  // Subtle dot grid (decorative)
  doc.setFillColor(99, 102, 241)
  const dotSpacing = 12
  for (let x = 14; x < W - 10; x += dotSpacing) {
    for (let y = 14; y < COVER_H - 6; y += dotSpacing) {
      doc.circle(x, y, 0.4, 'F')
    }
  }

  // Overlay to dim the dots
  doc.setFillColor(2, 8, 23)
  doc.setGState(doc.GState({ opacity: 0.82 }))
  doc.rect(0, 5, W, COVER_H - 5, 'F')
  doc.setGState(doc.GState({ opacity: 1 }))

  // FLUXO logo text
  doc.setTextColor(...C.white)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text('FLUXO', 14, 32)

  // Indigo accent bar under logo
  doc.setFillColor(...C.indigo)
  doc.rect(14, 34.5, 32, 1.2, 'F')

  // Title
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.light)
  doc.text(title, 14, 45)

  // Subtitle
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  doc.text(subtitle, 14, 52)

  // Period badge (right)
  const badgeW = 48
  const badgeX = W - 14 - badgeW
  doc.setFillColor(...C.indigo)
  doc.setGState(doc.GState({ opacity: 0.18 }))
  doc.roundedRect(badgeX, 40, badgeW, 16, 3, 3, 'F')
  doc.setGState(doc.GState({ opacity: 1 }))
  doc.setTextColor(...C.indigo)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(period, W - 14 - badgeW / 2, 46.5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.muted)
  doc.text(`${userName ?? 'Fluxo'}  ·  ${new Date().toLocaleDateString('es-UY')}`, W - 14 - badgeW / 2, 52.5, { align: 'center' })

  // Bottom divider
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.4)
  doc.line(0, COVER_H, W, COVER_H)
}

function sectionHeader(doc: jsPDF, text: string, y: number): number {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...C.dark)
  doc.rect(0, y - 1, W, 10, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.indigo)
  doc.text(text.toUpperCase(), 14, y + 5.5)
  doc.setDrawColor(...C.indigo)
  doc.setGState(doc.GState({ opacity: 0.35 }))
  doc.setLineWidth(0.3)
  doc.line(14, y + 8.5, W - 14, y + 8.5)
  doc.setGState(doc.GState({ opacity: 1 }))
  return y + 14
}

function addMetricCards(
  doc:   jsPDF,
  cards: { label: string; value: string; color: [number,number,number] }[],
  y:     number,
): number {
  const W      = doc.internal.pageSize.getWidth()
  const margin = 14
  const gap    = 4
  const cardW  = (W - margin * 2 - gap * (cards.length - 1)) / cards.length

  cards.forEach(({ label, value, color }, i) => {
    const x = margin + i * (cardW + gap)
    // Card background
    doc.setFillColor(15, 23, 42)
    doc.roundedRect(x, y, cardW, 20, 2, 2, 'F')
    // Left color stripe
    doc.setFillColor(...color)
    doc.roundedRect(x, y, 2.5, 20, 1, 1, 'F')
    // Label
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    doc.text(label.toUpperCase(), x + 6, y + 7)
    // Value
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...color)
    doc.text(value, x + 6, y + 16)
  })

  return y + 26
}

function addChartImage(
  doc:    jsPDF,
  imgUrl: string,
  y:      number,
  label:  string,
): number {
  const W     = doc.internal.pageSize.getWidth()
  const imgW  = W - 28
  const imgH  = imgW * 0.42 // aspect ratio ~2.4:1

  // Card background
  doc.setFillColor(15, 23, 42)
  doc.roundedRect(14, y, imgW, imgH + 2, 3, 3, 'F')

  // Image
  doc.addImage(imgUrl, 'PNG', 14, y, imgW, imgH, undefined, 'FAST')

  // Caption
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  doc.text(label, 14, y + imgH + 7)

  return y + imgH + 12
}

function addPageNumbers(doc: jsPDF) {
  const W       = doc.internal.pageSize.getWidth()
  const H       = doc.internal.pageSize.getHeight()
  const total   = (doc.internal as any).getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFillColor(...C.dark)
    doc.rect(0, H - 9, W, 9, 'F')
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    doc.text('Fluxo · Reporte de Finanzas Personales', 14, H - 3)
    doc.text(`Página ${p} / ${total}`, W - 14, H - 3, { align: 'right' })
  }
}

// ─── Global Dashboard PDF ─────────────────────────────────────────────────────

export async function exportGlobalPDF(data: GlobalExportData) {
  const { netWorth, totalAssets, totalDebt, income, expenses, savings, accounts, goals, currency, userName } = data
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Cover
  addCover(doc, 'Análisis Global', 'Patrimonio · Cuentas · Metas · Flujo', 'Global', userName)

  let y = 90

  // Summary metrics
  y = sectionHeader(doc, 'Patrimonio', y)
  y = addMetricCards(doc, [
    { label: 'Patrimonio Neto',  value: fmt(netWorth,    currency), color: C.indigo  },
    { label: 'Total Activos',    value: fmt(totalAssets, currency), color: C.emerald },
    { label: 'Total Deudas',     value: fmt(totalDebt,   currency), color: C.rose    },
  ], y)

  y = sectionHeader(doc, 'Mes actual', y)
  y = addMetricCards(doc, [
    { label: 'Ingresos',    value: fmt(income,   currency), color: C.cyan    },
    { label: 'Gastos',      value: fmt(expenses, currency), color: C.rose    },
    { label: 'Ahorro neto', value: fmt(savings,  currency), color: savings >= 0 ? C.emerald : C.rose },
  ], y)

  // Chart image
  const chartImg = await captureChart('fluxo-export-chart')
  if (chartImg) {
    y = sectionHeader(doc, 'Ingresos · Gastos · Ahorro', y)
    y = addChartImage(doc, chartImg, y, 'Evolución histórica mensual')
  }

  // Accounts table
  if (accounts.length > 0) {
    y = sectionHeader(doc, 'Cuentas', y)
    const typeLabel: Record<string, string> = {
      cash: 'Efectivo', debit: 'Débito', credit: 'Crédito', investment: 'Inversión',
    }
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Cuenta', 'Tipo', 'Balance']],
      body: accounts.map(a => [a.name, typeLabel[a.type] ?? a.type, fmt(a.balance, a.currency)]),
      headStyles:          { fillColor: C.indigo,   textColor: C.white, fontSize: 8, fontStyle: 'bold' },
      bodyStyles:          { fontSize: 8, textColor: C.light, fillColor: C.card  },
      alternateRowStyles:  { fillColor: C.border },
      columnStyles:        { 2: { halign: 'right' } },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // Goals table
  if (goals.length > 0) {
    y = sectionHeader(doc, 'Metas Financieras', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Meta', 'Progreso', 'Actual', 'Objetivo', 'Plazo']],
      body: goals.map(g => {
        const pct = g.target > 0 ? ((g.current / g.target) * 100).toFixed(0) + '%' : '—'
        return [g.name, pct, fmt(g.current, currency), fmt(g.target, currency), g.deadline ?? '—']
      }),
      headStyles:         { fillColor: C.indigoDk, textColor: C.white, fontSize: 8, fontStyle: 'bold' },
      bodyStyles:         { fontSize: 8, textColor: C.light, fillColor: C.card  },
      alternateRowStyles: { fillColor: C.border },
      columnStyles:       { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    })
  }

  addPageNumbers(doc)
  doc.save(`fluxo_global_${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ─── Monthly Dashboard PDF (light theme) ─────────────────────────────────────

export async function exportMonthlyPDF(data: MonthlyExportData) {
  const { breakdown, year, month, currency, userName } = data
  const { income, expenses, savings, categories, transactions } = breakdown
  const period = `${MONTH_NAMES[month - 1]} ${year}`
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W      = doc.internal.pageSize.getWidth()

  // ── Light palette ──────────────────────────────────────────────────────────
  const WHITE:    [number,number,number] = [255, 255, 255]
  const BG:       [number,number,number] = [248, 250, 252]  // slate-50
  const BORDER:   [number,number,number] = [226, 232, 240]  // slate-200
  const TEXT:     [number,number,number] = [15,  23,  42]   // slate-900
  const MUTED:    [number,number,number] = [100, 116, 139]  // slate-500
  const INDIGO:   [number,number,number] = [99,  102, 241]  // indigo-500
  const COVER_BG: [number,number,number] = [55,  48,  163]  // indigo-800
  const EMERALD:  [number,number,number] = [16,  185, 129]
  const ROSE:     [number,number,number] = [244, 63,  94]
  const CYAN:     [number,number,number] = [6,   182, 212]
  const VIOLET:   [number,number,number] = [139, 92,  246]

  const PIE_COLORS: [number,number,number][] = [
    INDIGO, EMERALD, ROSE, CYAN,
    [245, 158, 11], VIOLET, [236, 72, 153], [20, 184, 166], [251, 146, 60],
  ]

  // ── Helpers ────────────────────────────────────────────────────────────────
  const section = (label: string, y: number): number => {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEXT)
    doc.text(label, 14, y)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.25)
    doc.line(14, y + 2.5, W - 14, y + 2.5)
    return y + 8
  }

  // ── White page background ─────────────────────────────────────────────────
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, doc.internal.pageSize.getHeight(), 'F')

  // ── Cover / Header ────────────────────────────────────────────────────────
  const COVER_H = 36
  doc.setFillColor(...COVER_BG)
  doc.rect(0, 0, W, COVER_H, 'F')

  // "FLUXO" brand
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text('FLUXO', 14, 15)

  // Accent bar under brand
  doc.setFillColor(...INDIGO)
  doc.rect(14, 17.5, 28, 1, 'F')

  // Subtitle
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(196, 181, 253)  // indigo-200
  doc.text(`Reporte Mensual · ${period}`, 14, 26)

  // Generated date (right)
  doc.setFontSize(7.5)
  doc.setTextColor(196, 181, 253)
  doc.text(`Generado: ${new Date().toLocaleDateString('es-UY')}`, W - 14, 15, { align: 'right' })
  if (userName) {
    doc.text(userName, W - 14, 22, { align: 'right' })
  }

  let y = COVER_H + 10

  // ── Metric cards ──────────────────────────────────────────────────────────
  const savingsRate = income > 0 ? (savings / income) * 100 : 0
  const cards = [
    { label: 'INGRESOS',    value: fmt(income,   currency), color: CYAN    },
    { label: 'GASTOS',      value: fmt(expenses, currency), color: ROSE    },
    { label: 'AHORRO NETO', value: fmt(savings,  currency), color: savings >= 0 ? EMERALD : ROSE },
  ]
  const MARGIN  = 14
  const GAP     = 5
  const cardW   = (W - MARGIN * 2 - GAP * (cards.length - 1)) / cards.length
  const CARD_H  = 24

  cards.forEach(({ label, value, color }, i) => {
    const x = MARGIN + i * (cardW + GAP)
    doc.setFillColor(...WHITE)
    doc.roundedRect(x, y, cardW, CARD_H, 2, 2, 'F')
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, cardW, CARD_H, 2, 2, 'S')
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(label, x + cardW / 2, y + 8, { align: 'center' })
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...color)
    doc.text(value, x + cardW / 2, y + 18, { align: 'center' })
  })

  y += CARD_H + 5

  // Tasa de ahorro subtext
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text(
    `Tasa de ahorro: ${income > 0 ? savingsRate.toFixed(1) + '%' : '—'}`,
    W / 2, y, { align: 'center' },
  )
  y += 10

  // ── Distribución de Gastos ────────────────────────────────────────────────
  const expCats = categories.filter(c => c.total > 0)
  if (expCats.length > 0 && expenses > 0) {
    y = section('Distribución de Gastos', y)

    // Donut chart (left column)
    const CHART_MM = 62
    const pieImg   = createDonutChartDataUrl(expCats, PIE_COLORS, expenses)
    doc.addImage(pieImg, 'PNG', MARGIN, y, CHART_MM, CHART_MM)

    // Category table (right column)
    const TABLE_X = MARGIN + CHART_MM + 5
    autoTable(doc, {
      startY: y,
      margin: { left: TABLE_X, right: MARGIN },
      head: [['Categoría', 'Total', '% del gasto']],
      body: expCats.map(cat => {
        const pct = ((cat.total / expenses) * 100).toFixed(1) + '%'
        return [cat.name, fmt(cat.total, currency), pct]
      }),
      headStyles:         { fillColor: INDIGO, textColor: WHITE, fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles:         { fontSize: 7.5, textColor: TEXT, fillColor: WHITE },
      alternateRowStyles: { fillColor: BG },
      columnStyles:       { 1: { halign: 'right' }, 2: { halign: 'right', cellWidth: 22 } },
      tableLineColor:     BORDER,
      tableLineWidth:     0.1,
    })

    const tableEndY = (doc as any).lastAutoTable.finalY
    y = Math.max(y + CHART_MM, tableEndY) + 10
  }

  // ── Movimientos ───────────────────────────────────────────────────────────
  if (transactions.length > 0) {
    // Start new page if not enough room for at least a few rows
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage()
      doc.setFillColor(...WHITE)
      doc.rect(0, 0, W, doc.internal.pageSize.getHeight(), 'F')
      y = 14
    }

    y = section('Movimientos', y)

    const TYPE_LABEL: Record<string, string> = {
      income: 'Ingreso', expense: 'Gasto', transfer: 'Transfer.',
    }
    const METHOD_LABEL: Record<string, string> = {
      efectivo:              'Efectivo',
      tarjeta_credito:       'T. Crédito',
      tarjeta_debito:        'T. Débito',
      transferencia_bancaria:'Transferencia',
      billetera_digital:     'Digital',
      otro:                  'Otro',
    }

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Cuenta', 'Método', 'Monto']],
      body: transactions.map(tx => [
        fmtShort(tx.date),
        TYPE_LABEL[tx.type] ?? tx.type,
        tx.category_name,
        tx.concept_name,
        tx.account_name,
        tx.metodo_pago ? (METHOD_LABEL[tx.metodo_pago] ?? tx.metodo_pago) : '—',
        fmt(tx.type === 'expense' ? -tx.amount : tx.amount, currency),
      ]),
      headStyles: {
        fillColor: TEXT, textColor: INDIGO,
        fontSize: 7.5, fontStyle: 'bold',
        lineColor: BORDER, lineWidth: 0.3,
      },
      bodyStyles:         { fontSize: 7, textColor: TEXT, fillColor: WHITE },
      alternateRowStyles: { fillColor: BG },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 18 },
        5: { cellWidth: 22 },
        6: { halign: 'right', cellWidth: 24 },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 6) {
          const v = String(data.cell.raw ?? '')
          if (v.startsWith('-'))                    data.cell.styles.textColor = ROSE
          else if ((data.row.raw as string[])?.[1] === 'Ingreso') data.cell.styles.textColor = EMERALD
        }
      },
    })
  }

  // ── Footer / page numbers ─────────────────────────────────────────────────
  const totalPages = (doc.internal as any).getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const pH = doc.internal.pageSize.getHeight()
    doc.setFillColor(...BG)
    doc.rect(0, pH - 8, W, 8, 'F')
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.line(14, pH - 8, W - 14, pH - 8)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text('Fluxo · Finanzas personales', 14, pH - 3)
    doc.text(`Página ${p} de ${totalPages}`, W - 14, pH - 3, { align: 'right' })
  }

  doc.save(`fluxo_${year}-${String(month).padStart(2, '0')}.pdf`)
}

// ─── Household PDF ────────────────────────────────────────────────────────────

export async function exportHouseholdPDF(data: HouseholdExportData) {
  const { analytics, members, householdName, month, year } = data
  const period   = `${MONTH_NAMES[month - 1]} ${year}`
  const currency = analytics.base_currency
  const doc      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Cover
  addCover(doc, 'Análisis del Hogar', householdName, period, undefined)

  let y = 90

  // Summary
  y = sectionHeader(doc, 'Gastos compartidos', y)
  y = addMetricCards(doc, [
    { label: 'Total compartido', value: fmt(analytics.total_shared, currency), color: C.indigo },
    { label: 'Miembros',         value: String(members.length),                 color: C.cyan   },
    { label: 'Período',          value: period,                                 color: C.violet  },
  ], y)

  // Group expenses chart
  const donutImg = await captureChart('fluxo-export-household-donut')
  if (donutImg) {
    y = sectionHeader(doc, 'Distribución por Categoría', y)
    y = addChartImage(doc, donutImg, y, 'Gastos del grupo por categoría · ' + period)
  }

  // Member contributions
  if (analytics.members.length > 0) {
    y = sectionHeader(doc, 'Aportes por Miembro', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Miembro', '% Ingreso', 'Pagado', 'Debería pagar', 'Balance']],
      body: analytics.members.map(m => [
        m.user_name,
        m.income_pct.toFixed(1) + '%',
        fmt(m.expenses_paid, currency),
        fmt(m.should_pay, currency),
        fmt(m.balance, currency),
      ]),
      headStyles:         { fillColor: C.indigo, textColor: C.white, fontSize: 8, fontStyle: 'bold' },
      bodyStyles:         { fontSize: 8, textColor: C.light, fillColor: C.card },
      alternateRowStyles: { fillColor: C.border },
      columnStyles:       { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = analytics.members[data.row.index]?.balance ?? 0
          data.cell.styles.textColor = raw >= 0 ? C.emerald : C.rose
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // Settlement
  if (analytics.settlement.length > 0) {
    y = sectionHeader(doc, 'Liquidación de Deudas', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Deudor', 'Acreedor', 'Monto']],
      body: analytics.settlement.map(s => [
        s.from_user_name,
        s.to_user_name,
        fmt(s.amount, s.currency),
      ]),
      headStyles:         { fillColor: C.indigoDk, textColor: C.white, fontSize: 8, fontStyle: 'bold' },
      bodyStyles:         { fontSize: 8, textColor: C.light, fillColor: C.card },
      alternateRowStyles: { fillColor: C.border },
      columnStyles:       { 2: { halign: 'right' } },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // Shared expenses table
  if (analytics.shared_expenses.length > 0) {
    y = sectionHeader(doc, 'Gastos Compartidos', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Fecha', 'Concepto', 'Categoría', 'Pagado por', 'Monto']],
      body: analytics.shared_expenses.map(e => [
        fmtShort(e.date),
        e.concept_name,
        e.category_name,
        e.paid_by_user_name,
        fmt(e.amount, e.currency),
      ]),
      headStyles:         { fillColor: C.dark, textColor: C.indigo, fontSize: 7.5, fontStyle: 'bold', lineColor: C.border, lineWidth: 0.3 },
      bodyStyles:         { fontSize: 7, textColor: C.light, fillColor: C.card },
      alternateRowStyles: { fillColor: C.border },
      columnStyles:       { 0: { cellWidth: 14 }, 4: { halign: 'right', cellWidth: 28 } },
    })
  }

  addPageNumbers(doc)
  doc.save(`fluxo_hogar_${year}-${String(month).padStart(2, '0')}.pdf`)
}
