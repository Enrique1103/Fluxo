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

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?¿¡]/g, ' ')           // remove punctuation
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/\s+/g, ' ').trim()
}

function parseWrittenNumber(text: string): number | null {
  const words = norm(text).split(' ').filter(Boolean)
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
    // unknown word → stop consuming (don't return null yet, keep what we have)
  }

  total += current
  return found && total > 0 ? total : null
}

export function parseVoiceExpense(transcript: string): ParsedVoice {
  const rawTranscript = transcript
  let t = norm(transcript)

  // 1. Household keyword (anywhere in phrase)
  const isHousehold = /del hogar|para el hogar|\bhogar\b|compartido/.test(t)
  t = t.replace(/del hogar|para el hogar|\bhogar\b|compartido/g, '').replace(/\s+/g, ' ').trim()

  // 2. Account: everything after "desde" — consume artículos y palabras genéricas como prefijo
  let accountName: string | null = null
  const acctMatch = t.match(/\bdesde\s+(?:(?:la|el|mi)\s+(?:tarjeta|cuenta)(?:\s+de\s+(?:credito|debito))?\s+)?(.+)$/)
  if (acctMatch) {
    accountName = acctMatch[1].trim() || null
    t = t.slice(0, acctMatch.index!).replace(/\s+/g, ' ').trim()
  }

  // 3. Currency (before removing words, so we can detect it)
  let currency: 'UYU' | 'USD' | 'EUR' | null = null
  if (/\bdolar(?:es)?\b|\busd\b/.test(t))    currency = 'USD'
  else if (/\beuro(?:s)?\b|\beur\b/.test(t)) currency = 'EUR'
  else if (/\bpeso(?:s)?\b|\buyu\b/.test(t)) currency = 'UYU'
  t = t.replace(/\b(pesos?|dolares?|dolar|euros?|uyu|usd|eur)\b/g, '').replace(/\s+/g, ' ').trim()

  // 4. Amount: digit number first (scan the whole remaining string)
  let amount: number | null = null
  const digitMatch = t.match(/\d+(?:[.,]\d+)?/)
  if (digitMatch) {
    amount = parseFloat(digitMatch[0].replace(',', '.'))
    t = t.replace(digitMatch[0], '').replace(/\s+/g, ' ').trim()
  } else {
    // Written number: grab the segment before the first prep keyword "en/de/para"
    const noTrigger = t
      .replace(/^(?:gaste|gasto|pague|pago|compre|cobre|recibi|cobré|recibí)\s+/i, '')
      .trim()
    const prepIdx = noTrigger.search(/\b(?:en|de|para)\b/)
    const candidate = prepIdx >= 0 ? noTrigger.slice(0, prepIdx).trim() : noTrigger
    if (candidate) {
      amount = parseWrittenNumber(candidate)
      if (amount !== null) {
        t = t.replace(candidate, '').replace(/\s+/g, ' ').trim()
      }
    }
  }

  // 5. Concept: after first "en"/"de"/"para"
  let conceptName: string | null = null
  const prepMatch =
    t.match(/\ben\s+(.+?)$/) ||
    t.match(/\bde\s+(.+?)$/) ||
    t.match(/\bpara\s+(.+?)$/)
  if (prepMatch) {
    conceptName = prepMatch[1].trim() || null
  } else {
    const leftover = t
      .replace(/^(?:gaste|gasto|pague|pago|compre|cobre|recibi)\s*/i, '')
      .trim()
    if (leftover.length > 1) conceptName = leftover
  }

  return { amount, currency, conceptName, accountName, isHousehold, rawTranscript }
}

export function fuzzyMatch<T extends { name: string; id: string }>(
  query: string | null,
  items: T[],
): T | null {
  if (!query || items.length === 0) return null
  const q = norm(query.trim())

  const exact = items.find(i => norm(i.name) === q)
  if (exact) return exact

  const starts = items.find(i => norm(i.name).startsWith(q) || q.startsWith(norm(i.name)))
  if (starts) return starts

  const contains = items.find(i => norm(i.name).includes(q) || q.includes(norm(i.name)))
  if (contains) return contains

  const qWords = q.split(' ').filter(w => w.length > 2)
  return items.find(i => {
    const nWords = norm(i.name).split(' ')
    return qWords.some(qw => nWords.some(nw => nw.includes(qw) || qw.includes(nw)))
  }) ?? null
}
