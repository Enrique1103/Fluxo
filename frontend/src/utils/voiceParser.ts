export interface ParsedVoice {
  amount: number | null
  currency: 'UYU' | 'USD' | 'EUR' | null
  conceptName: string | null
  accountName: string | null
  isHousehold: boolean
  rawTranscript: string
}

const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100,
  doscientos: 200, doscientas: 200,
  trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500,
  seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
}

const TENS: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27,
  veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90,
}

const ONES: Record<string, number> = {
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
  cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
}

function parseWrittenNumber(text: string): number | null {
  const words = normalize(text).split(/\s+/)
  let total = 0
  let current = 0
  let found = false

  for (const w of words) {
    if (w === 'y' || w === 'con') continue
    if (w === 'mil') {
      found = true
      total += (current === 0 ? 1 : current) * 1000
      current = 0
    } else if (HUNDREDS[w] !== undefined) {
      found = true; current += HUNDREDS[w]
    } else if (TENS[w] !== undefined) {
      found = true; current += TENS[w]
    } else if (ONES[w] !== undefined) {
      found = true; current += ONES[w]
    }
  }

  total += current
  return found && total > 0 ? total : null
}

export function parseVoiceExpense(transcript: string): ParsedVoice {
  const rawTranscript = transcript
  const text = normalize(transcript).trim()

  const isHousehold = /del hogar|para el hogar|\bhogar\b|compartido/.test(text)
  let clean = text.replace(/del hogar|para el hogar|\bhogar\b|compartido/g, '').trim()

  // Account: after "desde" (optionally "la/mi cuenta")
  let accountName: string | null = null
  const acctMatch = clean.match(/desde\s+(?:(?:la|mi)\s+cuenta\s+)?(.+)$/)
  if (acctMatch) {
    accountName = acctMatch[1].trim() || null
    clean = clean.slice(0, acctMatch.index!).trim()
  }

  // Currency
  let currency: 'UYU' | 'USD' | 'EUR' | null = null
  if (/dolar(?:es)?|usd/.test(clean))   currency = 'USD'
  else if (/euro(?:s)?|eur/.test(clean)) currency = 'EUR'
  else if (/peso(?:s)?|uyu/.test(clean)) currency = 'UYU'
  clean = clean.replace(/\b(pesos?|dolares?|dolar|euros?|uyu|usd|eur)\b/g, '').trim()

  // Amount: digit first, then written
  let amount: number | null = null
  const digitMatch = clean.match(/\d+(?:[.,]\d+)?/)
  if (digitMatch) {
    amount = parseFloat(digitMatch[0].replace(',', '.'))
    clean = clean.replace(digitMatch[0], ' ').replace(/\s+/, ' ').trim()
  } else {
    const beforeEn = clean.split(/\ben\b/)[0]
    const withoutTrigger = beforeEn.replace(/^(?:gaste|gasto|pague|pago|compre|gaste|cobre|cobré|recibi)\s*/i, '').trim()
    amount = parseWrittenNumber(withoutTrigger)
    if (amount !== null) {
      clean = clean.replace(withoutTrigger, '').replace(/\s+/, ' ').trim()
    }
  }

  // Concept: after "en" / "de" / "para"
  let conceptName: string | null = null
  const conceptMatch =
    clean.match(/\ben\s+(.+)$/) ||
    clean.match(/\bde\s+(.+)$/) ||
    clean.match(/\bpara\s+(.+)$/)
  if (conceptMatch) {
    conceptName = conceptMatch[1].trim() || null
  } else {
    // Fallback: whatever remains after removing trigger word
    const leftover = clean.replace(/^(?:gaste|gasto|pague|pago|compre|gaste|cobre|recibi)\s*/i, '').trim()
    if (leftover.length > 1) conceptName = leftover
  }

  return { amount, currency, conceptName, accountName, isHousehold, rawTranscript }
}

export function fuzzyMatch<T extends { name: string; id: string }>(
  query: string | null,
  items: T[],
): T | null {
  if (!query || items.length === 0) return null
  const q = normalize(query.trim())

  const exact = items.find(i => normalize(i.name) === q)
  if (exact) return exact

  const starts = items.find(i => normalize(i.name).startsWith(q) || q.startsWith(normalize(i.name)))
  if (starts) return starts

  const contains = items.find(i => normalize(i.name).includes(q) || q.includes(normalize(i.name)))
  if (contains) return contains

  const qWords = q.split(/\s+/).filter(w => w.length > 2)
  return items.find(i => {
    const nWords = normalize(i.name).split(/\s+/)
    return qWords.some(qw => nWords.some(nw => nw.includes(qw) || qw.includes(nw)))
  }) ?? null
}
