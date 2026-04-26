export interface ParsedVoice {
  amount: number | null
  currency: 'UYU' | 'USD' | 'EUR' | null
  matchedAccountId: string | null
  matchedDestAccountId: string | null
  matchedConceptId: string | null
  isHousehold: boolean
  rawTranscript: string
  spokenAccountText: string | null
  spokenDestAccountText: string | null
  spokenConceptText: string | null
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

const NUMBER_WORDS = new Set([
  ...Object.keys(HUNDREDS),
  ...Object.keys(TENS),
  ...Object.keys(ONES),
  'mil', 'y',
])

// Spanish function words that will never be entity names
const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'en', 'a', 'al', 'por', 'para', 'con', 'sin', 'sobre', 'ante', 'bajo',
  'desde', 'hasta', 'mi', 'tu', 'su', 'nos', 'les', 'se', 'me', 'te',
  'y', 'o', 'ni', 'que', 'si', 'como', 'mas', 'pero', 'tambien',
])

export function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[$€£¥]/g, ' ')
    .replace(/[.,;:!?¿¡]/g, ' ')
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
  }

  total += current
  return found && total > 0 ? total : null
}

// Returns 0–4: 0=no match, 1=word overlap, 2=substring, 3=prefix, 4=exact
function matchScore(query: string, target: string): number {
  const q = norm(query)
  const t = norm(target)
  if (!q || q.length < 3) return 0
  if (q === t) return 4
  if (t.startsWith(q) || q.startsWith(t)) return 3
  if (t.includes(q) || q.includes(t)) return 2
  const qw = q.split(' ').filter(w => w.length > 2)
  const tw = t.split(' ')
  if (qw.length > 0 && qw.some(qwi => tw.some(twi => twi.includes(qwi) || qwi.includes(twi)))) return 1
  return 0
}

interface EntityMatch<T> {
  entity: T
  startIdx: number
  endIdx: number
  score: number
}

function findBestEntity<T extends { id: string; name: string; frequency_score?: number }>(
  words: string[],
  entities: T[],
  maxN = 4,
  minScore = 2,
): EntityMatch<T> | null {
  let best: EntityMatch<T> | null = null

  for (let n = Math.min(maxN, words.length); n >= 1; n--) {
    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ')
      for (const entity of entities) {
        const score = matchScore(ngram, entity.name)
        if (score < minScore) continue
        const span = n
        const bestSpan = best ? best.endIdx - best.startIdx : 0
        const bestFreq = best?.entity.frequency_score ?? 0
        const freq = entity.frequency_score ?? 0
        // Priority: score > span > frequency_score (most-used concept wins ties)
        const isBetter = !best
          || score > best.score
          || (score === best.score && span > bestSpan)
          || (score === best.score && span === bestSpan && freq > bestFreq)
        if (isBetter) {
          best = { entity, startIdx: i, endIdx: i + n, score }
        }
      }
    }
  }
  return best
}

function prepareForEntityScan(normalized: string): string[] {
  return normalized
    .split(' ')
    .filter(w =>
      w.length >= 3 &&
      !NUMBER_WORDS.has(w) &&
      !STOPWORDS.has(w) &&
      !/^(gaste|gasto|pague|pago|compre|cobre|recibi|cobro|cobrar|cuenta|tarjeta|banco|billetera)$/.test(w)
    )
}

export interface VoiceAccount {
  id: string
  name: string
  currency: string
  type: string
}

export function parseVoiceExpense(
  transcript: string,
  accounts: VoiceAccount[],
  concepts: { id: string; name: string; frequency_score?: number }[],
): ParsedVoice {
  const rawTranscript = transcript
  let t = norm(transcript)

  // 1. Household flag
  const isHousehold = /del hogar|para el hogar|\bhogar\b|compartido/.test(t)
  t = t.replace(/del hogar|para el hogar|\bhogar\b|compartido/g, '').replace(/\s+/g, ' ').trim()

  // 2. Amount — handles spaced thousands ("58 000"), Spanish notation ("1.500", "152.000,28"),
  //    double-period format ("152.000.28"), and plain decimals ("150,50").
  function mergeThousands(s: string): string {
    let prev = ''
    while (prev !== s) { prev = s; s = s.replace(/(\d+)\s(\d{3})(?!\d)/g, '$1$2') }
    return s
  }
  function parseNumericToken(raw: string): number | null {
    const s = raw.replace(/^[^\d]*/, '').replace(/[^\d.,]*$/, '')
    if (!s) return null
    // "1.500.000" or "152.000" — all periods are thousands separators (each group exactly 3 digits)
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ''), 10)
    // "1,500,000" — all commas are thousands separators
    if (/^\d{1,3}(,\d{3})+$/.test(s)) return parseInt(s.replace(/,/g, ''), 10)
    // "1.500,28" or "152.000,28" — period thousands + comma decimal
    if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'))
    // "152.000.28" or "1.500.28" — period thousands + period decimal (last group ≤ 2 digits)
    if (/^\d+(\.\d{3})+\.\d{1,2}$/.test(s)) {
      const parts = s.split('.')
      const decimal = parts.pop()!
      return parseFloat(parts.join('') + '.' + decimal)
    }
    // "150,28" — comma as decimal separator
    if (/^\d+,\d{1,2}$/.test(s)) return parseFloat(s.replace(',', '.'))
    // "150" or "150.28" — plain integer or decimal
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
    return null
  }

  const amountSource = mergeThousands(rawTranscript)
  t = mergeThousands(t)

  let amount: number | null = null
  let amountStr: string | null = null
  for (const word of amountSource.split(/\s+/)) {
    const n = parseNumericToken(word)
    if (n !== null && isFinite(n) && n > 0) {
      amount = n
      amountStr = word.replace(/^[^\d]*/, '').replace(/[^\d.,]*$/, '')
      break
    }
  }
  if (amountStr) {
    // norm() converts "." and "," to spaces, so "152.000.28" → "152 000 28" → mergeThousands → "152000 28"
    const amountInT = mergeThousands(norm(amountStr))
    t = t.replace(amountInT, '').replace(/\s+/g, ' ').trim()
  } else {
    // Fallback: written Spanish number ("cien", "doscientos", etc.)
    const noTrigger = t.replace(/\b(gaste|gasto|pague|pago|compre|cobre|recibi)\b/gi, '').trim()
    const prepIdx = noTrigger.search(/\b(?:en|de|para)\b/)
    const candidate = prepIdx >= 0 ? noTrigger.slice(0, prepIdx).trim() : noTrigger
    if (candidate) amount = parseWrittenNumber(candidate)
  }

  // 3. Detect voice currency keywords before removing them
  let voiceCurrency: 'UYU' | 'USD' | 'EUR' | null = null
  if (/\bdolar(?:es)?\b|\busd\b/.test(t))    voiceCurrency = 'USD'
  else if (/\beuro(?:s)?\b|\beur\b/.test(t)) voiceCurrency = 'EUR'
  else if (/\bpeso(?:s)?\b|\buyu\b/.test(t)) voiceCurrency = 'UYU'
  t = t.replace(/\b(pesos?|dolares?|dolar|euros?|uyu|usd|eur)\b/g, '').replace(/\s+/g, ' ').trim()

  let matchedAccountId: string | null = null
  let spokenAccountText: string | null = null
  let currency: 'UYU' | 'USD' | 'EUR' | null = voiceCurrency
  const usedIndices = new Set<number>()

  // 4a. Special case: "efectivo" → find cash account, use voice currency to disambiguate
  if (/\befectivo\b/.test(t)) {
    const cashAccounts = accounts.filter(a => a.type === 'cash')
    if (cashAccounts.length > 0) {
      const picked = voiceCurrency
        ? (cashAccounts.find(a => a.currency?.toUpperCase() === voiceCurrency) ?? cashAccounts[0])
        : cashAccounts[0]
      matchedAccountId = picked.id
      spokenAccountText = 'efectivo'
      const c = picked.currency?.toUpperCase()
      if (c === 'USD') currency = 'USD'
      else if (c === 'EUR') currency = 'EUR'
      else if (c === 'UYU') currency = 'UYU'
    }
    // Remove "efectivo" from text so it doesn't pollute concept scan
    t = t.replace(/\befectivo\b/g, '').replace(/\s+/g, ' ').trim()
  }

  // 4b. General account n-gram scan (skipped if efectivo already matched)
  const scanWords = prepareForEntityScan(t)

  if (!matchedAccountId && accounts.length > 0) {
    const acctResult = findBestEntity(scanWords, accounts, 4, 2)
    if (acctResult) {
      matchedAccountId = acctResult.entity.id
      spokenAccountText = scanWords.slice(acctResult.startIdx, acctResult.endIdx).join(' ')
      const c = acctResult.entity.currency?.toUpperCase()
      if (c === 'USD') currency = 'USD'
      else if (c === 'EUR') currency = 'EUR'
      else if (c === 'UYU') currency = 'UYU'
      for (let i = acctResult.startIdx; i < acctResult.endIdx; i++) usedIndices.add(i)
    }
  }

  // 5. Destination account scan on remaining words (for transfers)
  let matchedDestAccountId: string | null = null
  let spokenDestAccountText: string | null = null

  if (accounts.length > 0 && matchedAccountId) {
    const remainingForDest = scanWords.filter((_, i) => !usedIndices.has(i))
    const destAccounts = accounts.filter(a => a.id !== matchedAccountId)
    const destResult = findBestEntity(remainingForDest, destAccounts, 4, 2)
    if (destResult) {
      matchedDestAccountId = destResult.entity.id
      spokenDestAccountText = remainingForDest.slice(destResult.startIdx, destResult.endIdx).join(' ')
      for (let i = destResult.startIdx; i < destResult.endIdx; i++) usedIndices.add(i)
    }
  }

  // 6. Concept n-gram scan on remaining words
  let matchedConceptId: string | null = null
  let spokenConceptText: string | null = null

  if (concepts.length > 0) {
    const remainingWords = scanWords.filter((_, i) => !usedIndices.has(i))
    const conceptResult = findBestEntity(remainingWords, concepts, 4, 2)
    if (conceptResult) {
      matchedConceptId = conceptResult.entity.id
      spokenConceptText = remainingWords.slice(conceptResult.startIdx, conceptResult.endIdx).join(' ')
    }
  }

  return {
    amount,
    currency,
    matchedAccountId,
    matchedDestAccountId,
    matchedConceptId,
    isHousehold,
    rawTranscript,
    spokenAccountText,
    spokenDestAccountText,
    spokenConceptText,
  }
}
