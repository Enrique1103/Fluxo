import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic, X, Home, AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import { parseVoiceExpense, type VoiceAccount } from '../utils/voiceParser'
import { fetchAccounts, fetchCategories, fetchConcepts, createTransaction } from '../api/dashboard'
import { fetchHouseholds } from '../api/households'
import { invalidateFinancialData } from '../lib/queryClient'
import type { Account, Category, Concept } from '../api/dashboard'
import type { Household } from '../api/households'

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

const selectCls = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors'
const inputCls  = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors'

export default function VoiceExpenseModal({ open, onClose }: Props) {
  const qc = useQueryClient()

  const { data: accounts   = [] } = useQuery({ queryKey: ['accounts'],   queryFn: fetchAccounts,   enabled: open })
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories, enabled: open })
  const { data: concepts   = [] } = useQuery({ queryKey: ['concepts'],   queryFn: fetchConcepts,   enabled: open })
  const { data: households = [] } = useQuery({ queryKey: ['households'], queryFn: fetchHouseholds, enabled: open })

  const [phase,       setPhase]       = useState<Phase>('listening')
  const [listening,   setListening]   = useState(false)
  const [interim,     setInterim]     = useState('')
  const [speechError, setSpeechError] = useState('')

  // Review fields
  const [amount,      setAmount]      = useState('')
  const [currency,    setCurrency]    = useState('UYU')
  const [conceptId,   setConceptId]   = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [accountId,   setAccountId]   = useState('')
  const [description, setDescription] = useState('')
  const [isHousehold, setIsHousehold] = useState(false)
  const [householdId, setHouseholdId] = useState('')
  const [rawText,     setRawText]     = useState('')
  const [unmatchedAccount, setUnmatchedAccount] = useState<string | null>(null)
  const [unmatchedConcept, setUnmatchedConcept] = useState<string | null>(null)

  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')

  const recRef        = useRef<any>(null)
  const lastInterimRef = useRef('')
  const appliedRef     = useRef(false)

  // Default household when available
  useEffect(() => {
    if (households.length > 0 && !householdId) setHouseholdId(households[0].id)
  }, [households])

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase('listening')
      setListening(false)
      setInterim('')
      setSpeechError('')
      setAmount(''); setCurrency('UYU'); setConceptId(''); setCategoryId('')
      setAccountId(''); setDescription(''); setIsHousehold(false)
      setRawText(''); setUnmatchedAccount(null); setUnmatchedConcept(null)
      setSubmitting(false); setSubmitError('')
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

    // Fallback: en mobile Chrome el isFinal a veces no llega — usamos el último interim
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
    const parsed = parseVoiceExpense(
      transcript,
      accounts as VoiceAccount[],
      concepts as { id: string; name: string }[],
    )

    // DEBUG: show raw transcript + parsed amount so we can diagnose the extraction
    setRawText(`${transcript} [monto=${parsed.amount}]`)
    if (parsed.amount !== null && !isNaN(parsed.amount)) setAmount(String(parsed.amount))
    if (parsed.currency)        setCurrency(parsed.currency)
    setIsHousehold(parsed.isHousehold)

    if (parsed.matchedConceptId) {
      setConceptId(parsed.matchedConceptId)
      setUnmatchedConcept(null)
    } else if (parsed.spokenConceptText) {
      setConceptId('')
      setUnmatchedConcept(parsed.spokenConceptText)
    }

    if (parsed.matchedAccountId) {
      setAccountId(parsed.matchedAccountId)
      setUnmatchedAccount(null)
    } else if (parsed.spokenAccountText) {
      setAccountId(accounts[0]?.id ?? '')
      setUnmatchedAccount(parsed.spokenAccountText)
    } else {
      setAccountId(accounts[0]?.id ?? '')
    }

    setPhase('review')
  }

  async function handleConfirm() {
    if (!amount || parseFloat(amount) <= 0) { setSubmitError('El monto debe ser mayor a 0'); return }
    if (!conceptId)  { setSubmitError('Seleccioná un concepto'); return }
    if (!categoryId) { setSubmitError('Seleccioná una categoría'); return }
    if (!accountId)  { setSubmitError('Seleccioná una cuenta'); return }

    setSubmitting(true); setSubmitError('')
    try {
      await createTransaction({
        account_id:   accountId,
        concept_id:   conceptId,
        category_id:  categoryId,
        amount:       parseFloat(amount),
        type:         'expense',
        date:         today(),
        description:  description.trim() || undefined,
        metodo_pago:  'efectivo',
        ...(isHousehold && householdId ? { household_id: householdId } : {}),
      })
      await invalidateFinancialData(qc)
      onClose()
    } catch (e: any) {
      setSubmitError(e?.response?.data?.detail ?? 'No se pudo registrar el gasto')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl z-10 overflow-hidden"
        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Mic size={18} className="text-emerald-400" />
            <span className="font-semibold text-sm">
              {phase === 'listening' ? 'Di tu gasto' : 'Fluxo entendió'}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── LISTENING PHASE ─────────────────────────────── */}
        {phase === 'listening' && (
          <div className="px-5 pb-6 flex flex-col items-center gap-5">
            {/* Hint */}
            <div className="w-full rounded-xl px-4 py-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-slate-400 text-xs mb-1">Formato sugerido:</p>
              <p className="text-slate-300 text-sm">
                "gasté <span className="text-emerald-400">[monto]</span> en{' '}
                <span className="text-sky-400">[concepto]</span> desde{' '}
                <span className="text-violet-400">[cuenta]</span>{' '}
                <span className="text-amber-400">(del hogar)</span>"
              </p>
            </div>

            {/* Mic button */}
            {!isSpeechSupported ? (
              <p className="text-rose-400 text-sm text-center">Tu navegador no soporta reconocimiento de voz. Usá Chrome o Edge.</p>
            ) : (
              <button
                onClick={listening ? () => { recRef.current?.stop(); setListening(false) } : startListening}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  listening
                    ? 'bg-rose-500/20 border-2 border-rose-500 animate-pulse'
                    : 'bg-emerald-500/20 border-2 border-emerald-500 hover:bg-emerald-500/30'
                }`}
              >
                <Mic size={32} className={listening ? 'text-rose-400' : 'text-emerald-400'} />
              </button>
            )}

            {listening && <p className="text-slate-400 text-sm animate-pulse">Escuchando…</p>}
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
          <div className="px-5 pb-5 space-y-3">
            {/* Transcript */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
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
                <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectCls + ' w-24'}>
                  <option value="UYU">UYU</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            {/* Concept */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Concepto</label>
              {unmatchedConcept && (
                <div className="flex items-center gap-1.5 text-amber-400 text-xs mb-1">
                  <AlertCircle size={12} /> No encontré "{unmatchedConcept}", elegí uno:
                </div>
              )}
              <select value={conceptId} onChange={e => setConceptId(e.target.value)} className={selectCls + (conceptId ? '' : ' border-amber-500/50')}>
                <option value="">— Elegir concepto —</option>
                {(concepts as Concept[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Categoría</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectCls + (categoryId ? '' : ' border-amber-500/50')}>
                <option value="">— Elegir categoría —</option>
                {(categories as Category[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Account */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Cuenta</label>
              {unmatchedAccount && (
                <div className="flex items-center gap-1.5 text-amber-400 text-xs mb-1">
                  <AlertCircle size={12} /> No encontré "{unmatchedAccount}", elegí una:
                </div>
              )}
              <select value={accountId} onChange={e => setAccountId(e.target.value)} className={selectCls}>
                <option value="">— Elegir cuenta —</option>
                {(accounts as Account[]).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Descripción <span className="text-slate-600">(opcional)</span></label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={100}
                placeholder="Descripción del gasto"
                className={inputCls}
              />
            </div>

            {/* Household toggle — always visible */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors"
              style={{
                background: isHousehold ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isHousehold ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
              }}
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

            {/* Household selector */}
            {isHousehold && households.length > 1 && (
              <select value={householdId} onChange={e => setHouseholdId(e.target.value)} className={selectCls}>
                {(households as Household[]).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
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
                className="flex-1 py-3 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
