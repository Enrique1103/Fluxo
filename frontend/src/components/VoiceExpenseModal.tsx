import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic, X, Home, AlertCircle, Loader2, RotateCcw, CreditCard, ChevronDown } from 'lucide-react'
import { parseVoiceExpense, type VoiceAccount } from '../utils/voiceParser'
import { fetchAccounts, withoutArchived, fetchCategories, fetchConcepts, fetchExchangeRates, createTransaction, createInstalmentPlan, conceptsForType } from '../api/dashboard'
import { findRate, fmtRate } from '../utils/rates'
import { norm } from '../utils/voiceParser'
import { fetchHouseholds } from '../api/households'
import { invalidateFinancialData } from '../lib/queryClient'
import type { Account, Category, Concept } from '../api/dashboard'
import type { Household } from '../api/households'
import { useHomeCurrency } from '../hooks/useHomeCurrency'

interface Props {
  open: boolean
  onClose: () => void
}

type Phase = 'listening' | 'review'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

const isSpeechSupported = !!(
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
)

const inputCls = 'w-full border border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-slate-800 text-slate-200 placeholder:text-slate-500 outline-none focus:border-emerald-500/60 transition-colors'
const ddBtn    = 'w-full flex items-center justify-between border border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-slate-800 text-left transition-colors cursor-pointer'
const ddPanel  = 'absolute top-full left-0 mt-1 z-[200] w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 overflow-y-auto max-h-52'

export default function VoiceExpenseModal({ open, onClose }: Props) {
  const qc = useQueryClient()
  const homeCurrency = useHomeCurrency()
  const currencyOpts = [...new Set([homeCurrency, 'USD', 'EUR'])]

  const { data: accounts   = [], isLoading: loadingAccounts  } = useQuery({ queryKey: ['accounts'],   queryFn: fetchAccounts,   enabled: open, select: withoutArchived })
  const { data: categories = []                              } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories, enabled: open })
  const { data: concepts   = [], isLoading: loadingConcepts  } = useQuery({ queryKey: ['concepts'],   queryFn: fetchConcepts,   enabled: open })
  const { data: households = []                              } = useQuery({ queryKey: ['households'], queryFn: fetchHouseholds, enabled: open })
  const { data: rates      = []                              } = useQuery({ queryKey: ['exchange-rates'], queryFn: fetchExchangeRates, enabled: open })

  const dataReady = !loadingAccounts && !loadingConcepts

  const [phase,       setPhase]       = useState<Phase>('listening')
  // 'withdrawal' (Retiro): sacar efectivo de una cuenta; se guarda como transferencia hacia el efectivo
  const [txType,      setTxType]      = useState<'income' | 'expense' | 'transfer' | 'withdrawal'>('expense')
  const txTypeRef = useRef(txType)
  useEffect(() => { txTypeRef.current = txType }, [txType])
  const isMove = txType === 'transfer' || txType === 'withdrawal'
  const [listening,   setListening]   = useState(false)
  const [interim,     setInterim]     = useState('')
  const [speechError, setSpeechError] = useState('')

  const [amount,      setAmount]      = useState('')
  const [currency,    setCurrency]    = useState(homeCurrency)
  const [conceptId,   setConceptId]   = useState('')
  // Solo se elige el concepto; la categoría es la del concepto. La lista se filtra por tipo.
  const typeConcepts     = conceptsForType(concepts as Concept[], categories as Category[], txType)
  const selectedConcept  = (concepts as Concept[]).find(c => c.id === conceptId)
  const selectedCategory = selectedConcept ? (categories as Category[]).find(c => c.id === selectedConcept.category_id) : undefined
  const conceptGroups    = (categories as Category[])
    .map(cat => ({ cat, items: typeConcepts.filter(c => c.category_id === cat.id) }))
    .filter(g => g.items.length > 0)
  useEffect(() => {
    if (conceptId && (concepts as Concept[]).length > 0 && !typeConcepts.some(c => c.id === conceptId)) setConceptId('')
  }, [txType])
  const [accountId,   setAccountId]   = useState('')
  const [description, setDescription] = useState('')
  const [isHousehold, setIsHousehold] = useState(false)
  const [householdId, setHouseholdId] = useState('')
  const [rawText,     setRawText]     = useState('')
  const [unmatchedAccount, setUnmatchedAccount] = useState<string | null>(null)
  const [unmatchedConcept, setUnmatchedConcept] = useState<string | null>(null)
  const [destAccountId,    setDestAccountId]    = useState('')

  const [commission,  setCommission]  = useState('')
  // Retiro con cambio de moneda: el otro monto (lo que sale o lo que llega, según la moneda dicha)
  const [otherAmount, setOtherAmount] = useState('')
  const [enCuotas,    setEnCuotas]    = useState(false)
  const [nCuotas,     setNCuotas]     = useState('2')

  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [debugInfo,   setDebugInfo]   = useState('')

  const [openDd, setOpenDd] = useState<string | null>(null)
  const closeDd = () => setTimeout(() => setOpenDd(null), 150)

  const recRef         = useRef<any>(null)
  const lastInterimRef = useRef('')
  const appliedRef     = useRef(false)

  const categoriesRef = useRef<Category[]>([])
  useEffect(() => { categoriesRef.current = categories as Category[] }, [categories])
  const accountsRef = useRef<Account[]>([])
  const conceptsRef = useRef<Concept[]>([])
  useEffect(() => { accountsRef.current = accounts as Account[] }, [accounts])
  useEffect(() => { conceptsRef.current = concepts as Concept[] }, [concepts])

  useEffect(() => {
    if (households.length > 0 && !householdId) setHouseholdId(households[0].id)
  }, [households])

  useEffect(() => {
    if (open) {
      setPhase('listening')
      setListening(false)
      setInterim('')
      setSpeechError('')
      setTxType('expense')
      setAmount(''); setCurrency(homeCurrency); setConceptId('')
      setAccountId(''); setDestAccountId(''); setDescription(''); setIsHousehold(false)
      setRawText(''); setUnmatchedAccount(null); setUnmatchedConcept(null)
      setCommission(''); setOtherAmount('')
      setEnCuotas(false); setNCuotas('2')
      setSubmitting(false); setSubmitError('')
      setOpenDd(null)
    } else {
      recRef.current?.abort()
    }
  }, [open])

  function startListening() {
    if (!isSpeechSupported) { setSpeechError('Tu navegador no soporta reconocimiento de voz'); return }
    setSpeechError('')
    setInterim('')

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'es-UY'
    rec.continuous = false
    rec.interimResults = true
    recRef.current = rec

    lastInterimRef.current = ''
    appliedRef.current     = false

    rec.onstart = () => setListening(true)

    rec.onresult = (e: any) => {
      let final = '', inter = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript
        e.results[i].isFinal ? (final += txt) : (inter += txt)
      }
      if (inter) { lastInterimRef.current = inter; setInterim(inter) }
      if (final) {
        appliedRef.current = true
        rec.stop()
        applyTranscript(final.trim())
      }
    }

    rec.onend = () => {
      setListening(false)
      if (!appliedRef.current && lastInterimRef.current.trim()) {
        applyTranscript(lastInterimRef.current.trim())
      }
    }

    rec.onerror = (e: any) => {
      setListening(false)
      if (e.error !== 'no-speech') setSpeechError('No se pudo iniciar el micrófono')
    }

    rec.start()
  }

  function applyTranscript(transcript: string) {
    const latestAccounts = accountsRef.current
    const latestConcepts = conceptsRef.current

    const parsed = parseVoiceExpense(
      transcript,
      latestAccounts as VoiceAccount[],
      latestConcepts.map(c => ({ id: c.id, name: c.name, frequency_score: c.frequency_score })),
    )

    setDebugInfo(
      `C:${latestConcepts.length} A:${latestAccounts.length} amt:${parsed.amount ?? 'null'}` +
      ` | concept:${parsed.matchedConceptId ? latestConcepts.find(c=>c.id===parsed.matchedConceptId)?.name ?? parsed.matchedConceptId : (parsed.spokenConceptText ?? 'no match')}` +
      ` | acct:${parsed.matchedAccountId ? latestAccounts.find(a=>a.id===parsed.matchedAccountId)?.name ?? parsed.matchedAccountId : 'no match'}`
    )

    setRawText(transcript)
    if (parsed.amount !== null && !isNaN(parsed.amount)) setAmount(String(parsed.amount))
    if (parsed.currency) setCurrency(parsed.currency)
    setIsHousehold(parsed.isHousehold)

    // Solo vale un concepto que sirva para el tipo de movimiento (sin "Supermercado" en un ingreso)
    const okForType = parsed.matchedConceptId
      && conceptsForType(latestConcepts, categoriesRef.current, txTypeRef.current).some(c => c.id === parsed.matchedConceptId)
    if (parsed.matchedConceptId && okForType) {
      setConceptId(parsed.matchedConceptId)
      setUnmatchedConcept(null)
    } else if (parsed.matchedConceptId) {
      setConceptId('')
      setUnmatchedConcept(latestConcepts.find(c => c.id === parsed.matchedConceptId)?.name ?? parsed.spokenConceptText ?? null)
    } else if (parsed.spokenConceptText) {
      setConceptId('')
      setUnmatchedConcept(parsed.spokenConceptText)
    }

    if (parsed.matchedAccountId) {
      setAccountId(parsed.matchedAccountId)
      setUnmatchedAccount(null)
    } else if (parsed.spokenAccountText) {
      setAccountId(latestAccounts[0]?.id ?? '')
      setUnmatchedAccount(parsed.spokenAccountText)
    } else {
      setAccountId(latestAccounts[0]?.id ?? '')
    }

    if (parsed.matchedDestAccountId) setDestAccountId(parsed.matchedDestAccountId)
    setCommission(parsed.commission !== null ? String(parsed.commission) : '')
    setOtherAmount('')

    // Retiro: "saqué / retiré / extraje 100 dólares de Prex (con comisión de 60)"
    const saysWithdrawal = /\b(saque|retire|extraje|extraccion|retiro|cajero)\b/.test(norm(transcript))
    if (saysWithdrawal || txTypeRef.current === 'withdrawal') {
      setTxType('withdrawal')
      const all = latestAccounts as Account[]
      const isCash = (id: string | null) => !!id && all.find(a => a.id === id)?.type === 'cash'
      // El parser asigna "efectivo" como cuenta: en un retiro el efectivo es el destino
      let src = isCash(parsed.matchedAccountId) ? parsed.matchedDestAccountId : parsed.matchedAccountId
      if (!src || isCash(src)) src = all.find(a => a.type !== 'cash')?.id ?? null
      const cash = all.filter(a => a.type === 'cash')
      const spoken = parsed.spokenCurrency
      // El monto dicho está en la moneda dicha (ej: "100 dólares" desde una cuenta en pesos)
      if (spoken) setCurrency(spoken)
      const dest = (isCash(parsed.matchedDestAccountId) ? parsed.matchedDestAccountId : null)
        ?? (isCash(parsed.matchedAccountId) ? parsed.matchedAccountId : null)
        ?? (spoken ? cash.find(a => a.currency?.toUpperCase() === spoken)?.id : null)
        ?? cash.find(a => a.currency === all.find(x => x.id === src)?.currency)?.id
        ?? cash[0]?.id ?? ''
      if (src) setAccountId(src)
      setDestAccountId(dest)
      setUnmatchedAccount(null)
      // Concepto: el lugar si se dijo (Abitab, Redpagos…); si no, el más usado de "Extracción de Dinero"
      const cats = categoriesRef.current
      const extr = cats.find(c => norm(c.name).includes('extraccion'))
      if (extr) {
        const extrConcept = conceptsRef.current.filter(c => c.category_id === extr.id)
          .sort((a, b) => b.frequency_score - a.frequency_score)[0]
        if (extrConcept) setConceptId(prev => prev || extrConcept.id)
      }
    }

    setPhase('review')
  }

  const selectedAccount = (accounts as Account[]).find(a => a.id === accountId)
  const isCredit = selectedAccount?.type === 'credit'
  const destAccount = (accounts as Account[]).find(a => a.id === destAccountId)
  const crossCurrency = isMove && !!selectedAccount && !!destAccount && selectedAccount.currency !== destAccount.currency
  // El monto dicho puede estar en la moneda que sale (pesos) o en la que llega (dólares)
  const amountIsDest = crossCurrency && currency === destAccount!.currency
  const crossRate = crossCurrency ? findRate(rates, selectedAccount!.currency, destAccount!.currency, today()) : null
  const estOther = crossRate !== null && parseFloat(amount) > 0
    ? (amountIsDest ? parseFloat(amount) / crossRate : parseFloat(amount) * crossRate).toFixed(2)
    : null

  function derivedMetodoPago(): 'efectivo' | 'tarjeta_credito' | 'tarjeta_debito' | 'transferencia_bancaria' | 'billetera_digital' | 'otro' {
    if (!selectedAccount) return 'otro'
    if (selectedAccount.type === 'cash')   return 'efectivo'
    if (selectedAccount.type === 'credit') return 'tarjeta_credito'
    if (selectedAccount.type === 'debit')  return 'tarjeta_debito'
    return 'otro'
  }

  async function handleConfirm() {
    if (!amount || parseFloat(amount) <= 0) { setSubmitError('El monto debe ser mayor a 0'); return }
    if (!accountId) { setSubmitError('Seleccioná una cuenta'); return }

    if (isMove) {
      if (!destAccountId) {
        setSubmitError(txType === 'withdrawal' ? 'Elegí el efectivo donde queda la plata' : 'Seleccioná la cuenta destino'); return
      }
    } else {
      if (!conceptId) { setSubmitError('Elegí un concepto'); return }
    }

    if (txType === 'expense' && isCredit && enCuotas) {
      const n = parseInt(nCuotas)
      if (!n || n < 2) { setSubmitError('El número de cuotas debe ser al menos 2'); return }
    }

    // La categoría sale del concepto. En transferencias sin concepto el servidor usa "Transferencia".
    const resolvedConceptId = txType === 'transfer'
      ? ((concepts as Concept[]).find(c => c.name.toLowerCase() === 'transferencia')?.id ?? '')
      : conceptId

    // Retiro en otra moneda: amount = lo que sale de la cuenta; destination_amount = lo que llega
    let sourceAmount = parseFloat(amount)
    let destinationAmount: number | undefined
    if (crossCurrency) {
      const other = parseFloat(otherAmount) > 0 ? parseFloat(otherAmount) : (estOther ? parseFloat(estOther) : NaN)
      if (amountIsDest) {
        if (isNaN(other)) { setSubmitError(`Indicá cuánto salió de ${selectedAccount!.name} (${selectedAccount!.currency})`); return }
        destinationAmount = parseFloat(amount)
        sourceAmount = other
      } else if (parseFloat(otherAmount) > 0) {
        destinationAmount = parseFloat(otherAmount)
      }
    }

    setSubmitting(true); setSubmitError('')
    try {
      if (txType === 'expense' && isCredit && enCuotas) {
        await createInstalmentPlan({
          account_id:   accountId,
          concept_id:   resolvedConceptId,
          total_amount: parseFloat(amount),
          n_cuotas:     parseInt(nCuotas),
          fecha_inicio: today(),
          description:  description.trim() || undefined,
          metodo_pago:  'tarjeta_credito',
        })
      } else {
        await createTransaction({
          account_id:   accountId,
          concept_id:   resolvedConceptId || null,
          amount:       sourceAmount,
          type:         isMove ? 'transfer' : txType,
          date:         today(),
          description:  description.trim() || undefined,
          ...(txType === 'expense' ? { metodo_pago: derivedMetodoPago() } : {}),
          ...(isMove && destAccountId ? { transfer_to_account_id: destAccountId } : {}),
          ...(isMove && commission && parseFloat(commission) > 0 ? { commission: parseFloat(commission) } : {}),
          ...(destinationAmount ? { destination_amount: destinationAmount } : {}),
          ...(txType === 'expense' && isHousehold && householdId ? { household_id: householdId } : {}),
        })
      }
      await invalidateFinancialData(qc)
      onClose()
    } catch (e: any) {
      setSubmitError(e?.response?.data?.detail ?? 'No se pudo registrar el movimiento')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl z-10 flex flex-col max-h-[92dvh] bg-slate-900 border border-slate-800/60 pb-[env(safe-area-inset-bottom)] sm:pb-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Mic size={18} className="text-emerald-400" />
            <span className="font-semibold text-sm text-white">
              {phase === 'listening'
                ? txType === 'income' ? 'Di tu ingreso' : txType === 'transfer' ? 'Di tu transferencia' : txType === 'withdrawal' ? 'Di tu retiro' : 'Di tu gasto'
                : 'Fluxo entendió'}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── LISTENING PHASE ─────────────────────────────── */}
        {phase === 'listening' && (
          <div className="px-5 pb-6 flex flex-col items-center gap-5">
            {/* Type toggle */}
            <div className="w-full grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-800/30 border border-slate-700/50">
              {(['income', 'expense', 'transfer', 'withdrawal'] as const).map(type => {
                const labels = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia', withdrawal: 'Retiro' }
                const colors = {
                  income:   'bg-cyan-400/15 border-cyan-400/40 text-cyan-400',
                  expense:  'bg-rose-400/15 border-rose-400/40 text-rose-400',
                  transfer: 'bg-amber-400/15 border-amber-400/40 text-amber-400',
                  withdrawal: 'bg-lime-400/15 border-lime-400/40 text-lime-400',
                }
                const active = txType === type
                return (
                  <button
                    key={type}
                    onClick={() => setTxType(type)}
                    className={`min-w-0 py-2 px-0.5 rounded-lg text-[11px] min-[380px]:text-xs font-medium tracking-tight border truncate transition-all ${
                      active ? colors[type] : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {labels[type]}
                  </button>
                )
              })}
            </div>

            {/* Hint */}
            <div className="w-full rounded-xl px-4 py-3 text-center bg-slate-800/30 border border-slate-700/50">
              <p className="text-slate-400 text-xs mb-1">Formato sugerido:</p>
              {txType === 'expense' && (
                <p className="text-slate-300 text-sm">
                  "gasté <span className="text-emerald-400">[monto]</span> en{' '}
                  <span className="text-sky-400">[concepto]</span> desde{' '}
                  <span className="text-violet-400">[cuenta]</span>{' '}
                  <span className="text-amber-400">(del hogar)</span>"
                </p>
              )}
              {txType === 'income' && (
                <p className="text-slate-300 text-sm">
                  "cobré <span className="text-emerald-400">[monto]</span> por{' '}
                  <span className="text-sky-400">[concepto]</span> en{' '}
                  <span className="text-violet-400">[cuenta]</span>"
                </p>
              )}
              {txType === 'withdrawal' && (
                <p className="text-slate-300 text-sm">
                  "saqué <span className="text-emerald-400">[monto]</span>{' '}
                  <span className="text-lime-400">(en dólares)</span> de{' '}
                  <span className="text-violet-400">[cuenta]</span>{' '}
                  <span className="text-sky-400">(en Abitab)</span>{' '}
                  <span className="text-slate-500">con comisión de [monto]</span>"
                </p>
              )}
              {txType === 'transfer' && (
                <p className="text-slate-300 text-sm">
                  "transferí <span className="text-emerald-400">[monto]</span> de{' '}
                  <span className="text-violet-400">[cuenta origen]</span> a{' '}
                  <span className="text-amber-400">[cuenta destino]</span>{' '}
                  <span className="text-slate-500">con comisión de [monto]</span>"
                </p>
              )}
            </div>

            {/* Mic button */}
            {!isSpeechSupported ? (
              <p className="text-rose-400 text-sm text-center">Tu navegador no soporta reconocimiento de voz. Usá Chrome o Edge.</p>
            ) : (
              <button
                onClick={listening ? () => { recRef.current?.stop(); setListening(false) } : startListening}
                disabled={!dataReady}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  !dataReady
                    ? 'bg-slate-800/30 border-2 border-slate-600 opacity-50 cursor-wait'
                    : listening
                      ? 'bg-rose-500/20 border-2 border-rose-500 animate-pulse'
                      : 'bg-emerald-500/20 border-2 border-emerald-500 hover:bg-emerald-500/30'
                }`}
              >
                {!dataReady
                  ? <Loader2 size={32} className="text-slate-500 animate-spin" />
                  : <Mic size={32} className={listening ? 'text-rose-400' : 'text-emerald-400'} />
                }
              </button>
            )}

            {!dataReady && <p className="text-slate-500 text-xs">Cargando cuentas y conceptos…</p>}
            {dataReady && listening && <p className="text-slate-400 text-sm animate-pulse">Escuchando…</p>}
            {interim && <p className="text-slate-300 text-sm italic text-center">"{interim}"</p>}
            {speechError && (
              <div className="flex items-center gap-2 text-rose-400 text-sm">
                <AlertCircle size={14} /> {speechError}
              </div>
            )}
          </div>
        )}

        {/* ── REVIEW PHASE ────────────────────────────────── */}
        {phase === 'review' && (
          <div className="px-5 pb-5 space-y-3 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.700)_transparent]">
            {/* Transcript */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/30">
              <Mic size={13} className="text-slate-500 shrink-0" />
              <p className="text-slate-400 text-xs italic truncate">"{rawText}"</p>
              <button
                onClick={() => setPhase('listening')}
                className="ml-auto text-slate-500 hover:text-emerald-400 transition-colors shrink-0"
                title="Volver a escuchar"
              >
                <RotateCcw size={13} />
              </button>
            </div>
            {debugInfo && (
              <p className="text-slate-600 text-xs px-1 break-all">{debugInfo}</p>
            )}

            {/* Amount + currency */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Monto</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  className={inputCls + ' flex-1'}
                />
                {/* Currency picker */}
                <div className="relative">
                  <button
                    onClick={() => setOpenDd(openDd === 'currency' ? null : 'currency')}
                    onBlur={closeDd}
                    className="flex items-center gap-1.5 w-24 border border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-slate-800 text-slate-200 justify-between transition-colors"
                  >
                    <span>{currency}</span>
                    <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                  </button>
                  {openDd === 'currency' && (
                    <div className="absolute top-full right-0 mt-1 z-[200] bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden min-w-[80px]">
                      {currencyOpts.map(c => (
                        <button
                          key={c}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { setCurrency(c); setOpenDd(null) }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between gap-3 ${currency === c ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}
                        >
                          {c}
                          {currency === c && <span className="text-emerald-400 text-[10px]">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Concept + Category — not for transfers */}
            {txType !== 'transfer' && (
              <>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Concepto {txType === 'withdrawal' && <span className="text-slate-600">(opcional)</span>}
                  </label>
                  {unmatchedConcept && (
                    <div className="flex items-center gap-1.5 text-amber-400 text-xs mb-1">
                      <AlertCircle size={12} /> No encontré "{unmatchedConcept}" para este tipo de movimiento, elegí uno:
                    </div>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => setOpenDd(openDd === 'concept' ? null : 'concept')}
                      onBlur={closeDd}
                      className={`${ddBtn} ${conceptId ? 'text-slate-200' : 'text-slate-400 border-amber-500/50'}`}
                    >
                      <span className="truncate">
                        {selectedConcept ? selectedConcept.name : txType === 'withdrawal' ? 'Transferencia' : '— Elegir concepto —'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                    </button>
                    {openDd === 'concept' && (
                      <div className={ddPanel}>
                        {conceptGroups.map(({ cat, items }) => (
                          <div key={cat.id}>
                            <p className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-slate-500">{cat.name}</p>
                            {items.map(c => (
                              <button
                                key={c.id}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { setConceptId(c.id); setUnmatchedConcept(null); setOpenDd(null) }}
                                className={`w-full text-left pl-6 pr-3 py-1.5 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${conceptId === c.id ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}
                              >
                                <span className="truncate">{c.name}</span>
                                {conceptId === c.id && <span className="text-emerald-400 text-[10px] shrink-0 ml-2">✓</span>}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedCategory && (
                    <p className="mt-1 text-[11px] text-slate-500">Categoría: <span className="text-slate-300">{selectedCategory.name}</span></p>
                  )}
                </div>
              </>
            )}

            {/* Source account */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                {txType === 'transfer' ? 'Cuenta origen' : txType === 'withdrawal' ? 'Sacás de' : 'Cuenta'}
              </label>
              {unmatchedAccount && (
                <div className="flex items-center gap-1.5 text-amber-400 text-xs mb-1">
                  <AlertCircle size={12} /> No encontré "{unmatchedAccount}", elegí una:
                </div>
              )}
              <div className="relative">
                <button
                  onClick={() => setOpenDd(openDd === 'account' ? null : 'account')}
                  onBlur={closeDd}
                  className={`${ddBtn} ${accountId ? 'text-slate-200' : 'text-slate-400'}`}
                >
                  <span className="truncate">
                    {accountId
                      ? (accounts as Account[]).find(a => a.id === accountId)?.name ?? '— Elegir cuenta —'
                      : '— Elegir cuenta —'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                </button>
                {openDd === 'account' && (
                  <div className={ddPanel}>
                    {(accounts as Account[]).map(a => (
                      <button
                        key={a.id}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setAccountId(a.id); setOpenDd(null) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${accountId === a.id ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}
                      >
                        <span className="truncate">{a.name}</span>
                        {accountId === a.id && <span className="text-emerald-400 text-[10px] shrink-0 ml-2">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Dest account — transferencias (otra cuenta) y retiros (efectivo) */}
            {isMove && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">{txType === 'withdrawal' ? 'Efectivo donde queda la plata' : 'Cuenta destino'}</label>
                <div className="relative">
                  <button
                    onClick={() => setOpenDd(openDd === 'destAccount' ? null : 'destAccount')}
                    onBlur={closeDd}
                    className={`${ddBtn} ${destAccountId ? 'text-slate-200' : 'text-slate-400 border-amber-500/50'}`}
                  >
                    <span className="truncate">
                      {destAccountId
                        ? (accounts as Account[]).find(a => a.id === destAccountId)?.name ?? '— Elegir cuenta destino —'
                        : '— Elegir cuenta destino —'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                  </button>
                  {openDd === 'destAccount' && (
                    <div className={ddPanel}>
                      {(accounts as Account[]).filter(a => a.id !== accountId && (txType !== 'withdrawal' || a.type === 'cash')).map(a => (
                        <button
                          key={a.id}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { setDestAccountId(a.id); setOpenDd(null) }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${destAccountId === a.id ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}
                        >
                          <span className="truncate">{a.name}</span>
                          {destAccountId === a.id && <span className="text-emerald-400 text-[10px] shrink-0 ml-2">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cambio de moneda: el monto dicho es de un lado; acá va el del otro */}
            {crossCurrency && (
              <div className="rounded-xl border border-lime-500/20 bg-lime-500/5 p-3">
                <label className="text-xs text-slate-400 mb-1 block">
                  {amountIsDest
                    ? `Cuánto salió de ${selectedAccount!.name} (${selectedAccount!.currency})`
                    : `Cuánto llegó a ${destAccount!.name} (${destAccount!.currency})`}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={otherAmount}
                  onChange={e => setOtherAmount(e.target.value)}
                  placeholder={estOther ?? '0'}
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {parseFloat(otherAmount) > 0 && parseFloat(amount) > 0
                    ? `Cambio aplicado: ${fmtRate(
                        amountIsDest ? parseFloat(amount) / parseFloat(otherAmount) : parseFloat(otherAmount) / parseFloat(amount),
                        selectedAccount!.currency, destAccount!.currency)}`
                    : crossRate !== null
                      ? `Si lo dejás vacío se calcula con tu tasa: ${fmtRate(crossRate, selectedAccount!.currency, destAccount!.currency)}`
                      : 'No tenés tasa cargada para este cambio: completalo'}
                </p>
              </div>
            )}

            {/* Comisión — transferencias y retiros */}
            {isMove && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  Comisión bancaria{selectedAccount ? ` (${selectedAccount.currency}, se descuenta de ${selectedAccount.name})` : ''}{' '}
                  <span className="text-slate-600">(opcional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={commission}
                  onChange={e => setCommission(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </div>
            )}

            {/* Cuotas toggle — solo gastos con tarjeta crédito */}
            {txType === 'expense' && isCredit && (
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors border ${enCuotas ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-800/30 border-slate-700/50'}`}
                onClick={() => setEnCuotas(v => !v)}
              >
                <CreditCard size={16} className={enCuotas ? 'text-emerald-400' : 'text-slate-500'} />
                <span className={`text-sm flex-1 ${enCuotas ? 'text-emerald-300' : 'text-slate-400'}`}>
                  ¿Pagar en cuotas?
                </span>
                <div className={`w-9 h-5 rounded-full transition-colors relative ${enCuotas ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enCuotas ? 'left-[18px]' : 'left-0.5'}`} />
                </div>
              </div>
            )}

            {/* Número de cuotas */}
            {txType === 'expense' && isCredit && enCuotas && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Número de cuotas</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={nCuotas}
                  onChange={e => setNCuotas(e.target.value)}
                  placeholder="2"
                  className={inputCls}
                />
              </div>
            )}

            {/* Description */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Descripción <span className="text-slate-600">(opcional)</span></label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={100}
                placeholder={txType === 'income' ? 'Descripción del ingreso' : txType === 'transfer' ? 'Descripción de la transferencia' : txType === 'withdrawal' ? 'Descripción del retiro' : 'Descripción del gasto'}
                className={inputCls}
              />
            </div>

            {/* Household toggle — solo para gastos */}
            {txType === 'expense' && (
              <>
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors border ${isHousehold ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-slate-800/30 border-slate-700/50'}`}
                  onClick={() => setIsHousehold(v => !v)}
                >
                  <Home size={16} className={isHousehold ? 'text-indigo-400' : 'text-slate-500'} />
                  <span className={`text-sm flex-1 ${isHousehold ? 'text-indigo-300' : 'text-slate-400'}`}>
                    ¿Del hogar?
                  </span>
                  <div className={`w-9 h-5 rounded-full transition-colors relative ${isHousehold ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isHousehold ? 'left-[18px]' : 'left-0.5'}`} />
                  </div>
                </div>

                {isHousehold && households.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => setOpenDd(openDd === 'household' ? null : 'household')}
                      onBlur={closeDd}
                      className={`${ddBtn} ${householdId ? 'text-slate-200' : 'text-slate-400'}`}
                    >
                      <span className="truncate">
                        {householdId
                          ? (households as Household[]).find(h => h.id === householdId)?.name ?? '—'
                          : '—'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                    </button>
                    {openDd === 'household' && (
                      <div className={ddPanel}>
                        {(households as Household[]).map(h => (
                          <button
                            key={h.id}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setHouseholdId(h.id); setOpenDd(null) }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${householdId === h.id ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}
                          >
                            <span className="truncate">{h.name}</span>
                            {householdId === h.id && <span className="text-emerald-400 text-[10px] shrink-0 ml-2">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {submitError && (
              <div className="flex items-center gap-2 text-rose-400 text-sm">
                <AlertCircle size={14} /> {submitError}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition-colors border border-slate-700/50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting
                  ? <Loader2 size={16} className="animate-spin" />
                  : txType === 'income' ? 'Registrar ingreso' : txType === 'transfer' ? 'Transferir' : txType === 'withdrawal' ? 'Registrar retiro' : 'Confirmar gasto'
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
