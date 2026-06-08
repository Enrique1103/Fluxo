import { useState } from 'react'
import { Flag, Loader2, Trash2, MessageSquare, ChevronDown, CheckCircle2, XCircle, Clock, MessageCircle, Send, History } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchReviews, respondReview, deleteReview,
  FLAG_TYPE_LABELS, STATUS_LABELS,
} from '../../api/reviews'
import type { Review, ReviewStatus } from '../../api/reviews'
import type { HouseholdMember } from '../../api/households'
import { avatarPalette } from './household.utils'

interface Props {
  householdId: string
  currentUserId: string
  members: HouseholdMember[]
}

const STATUS_ICON: Record<ReviewStatus, React.ReactNode> = {
  pendiente:  <Clock        className="w-3 h-3" />,
  respondida: <MessageCircle className="w-3 h-3" />,
  resuelta:   <CheckCircle2 className="w-3 h-3" />,
  descartada: <XCircle      className="w-3 h-3" />,
}

const STATUS_STYLES: Record<ReviewStatus, string> = {
  pendiente:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  respondida: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  resuelta:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  descartada: 'bg-slate-700/50 text-slate-500 border-slate-600/50',
}

const RESPOND_OPTIONS: { value: ReviewStatus; label: string; active: string; icon: React.ReactNode }[] = [
  { value: 'respondida', label: 'Respondida', icon: <MessageCircle className="w-3 h-3" />, active: 'bg-blue-500/20 border-blue-500/40 text-blue-400' },
  { value: 'resuelta',   label: 'Resuelta',   icon: <CheckCircle2  className="w-3 h-3" />, active: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' },
  { value: 'descartada', label: 'Descartar',  icon: <XCircle       className="w-3 h-3" />, active: 'bg-rose-500/20 border-rose-500/40 text-rose-400' },
]

function RespondForm({ review, householdId, onDone }: { review: Review; householdId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [status, setStatus]   = useState<ReviewStatus>('respondida')
  const [comment, setComment] = useState('')

  const mutation = useMutation({
    mutationFn: () => respondReview(householdId, review.id, {
      status,
      response_comment: comment.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', householdId] })
      onDone()
    },
  })

  return (
    <div className="mt-3 space-y-2.5">
      {/* Status pills */}
      <div className="flex gap-1.5">
        {RESPOND_OPTIONS.map(o => (
          <button key={o.value} onClick={() => setStatus(o.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              status === o.value
                ? o.active
                : 'bg-slate-800/60 border-slate-700/50 text-slate-500 hover:text-slate-300'
            }`}>
            {o.icon}{o.label}
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        maxLength={500} rows={2}
        placeholder="Tu respuesta (opcional)..."
        className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/50 resize-none placeholder:text-slate-600 transition-colors"
      />

      {mutation.isError && <p className="text-[10px] text-rose-400">Error al responder.</p>}

      <div className="flex gap-2">
        <button onClick={onDone}
          className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-700/50 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all">
          Cancelar
        </button>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 hover:bg-indigo-500/25 disabled:opacity-60 transition-all">
          {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Confirmar
        </button>
      </div>
    </div>
  )
}

function ReviewThread({
  review, householdId, currentUserId, isAdmin, members,
}: {
  review: Review
  householdId: string
  currentUserId: string
  isAdmin: boolean
  members: HouseholdMember[]
}) {
  const qc = useQueryClient()
  const [responding, setResponding] = useState(false)

  const author     = members.find(m => m.user_id === review.flagged_by_user_id)
  const authorName = author?.user_name ?? 'Miembro'
  const pal        = avatarPalette(authorName)
  const isAuthor   = review.flagged_by_user_id === currentUserId
  const canDelete  = isAuthor && review.status === 'pendiente'
  const canRespond = isAdmin && !['resuelta', 'descartada'].includes(review.status)

  const deleteMutation = useMutation({
    mutationFn: () => deleteReview(householdId, review.id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['reviews', householdId] }),
  })

  const dateStr = new Date(review.created_at).toLocaleDateString('es-UY', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 mt-0.5 ${pal.bg} ${pal.text}`}>
        {authorName.charAt(0).toUpperCase()}
      </div>

      {/* Thread content */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-200">{authorName}</span>
            <span className="text-[10px] text-slate-600">{dateStr}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {FLAG_TYPE_LABELS[review.flag_type]}
            </span>
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[review.status]}`}>
              {STATUS_ICON[review.status]}
              {STATUS_LABELS[review.status]}
            </span>
          </div>

          {/* Actions */}
          {!responding && (canRespond || canDelete) && (
            <div className="flex items-center gap-1 shrink-0">
              {canRespond && (
                <button onClick={() => setResponding(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-all">
                  <MessageSquare className="w-3 h-3" />Responder
                </button>
              )}
              {canDelete && (
                <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all disabled:opacity-50">
                  {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Message bubble */}
        {review.comment && (
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-xs text-slate-300 leading-relaxed mb-2">
            {review.comment}
          </div>
        )}

        {/* Admin reply */}
        {review.response_comment && (
          <div className="flex gap-2.5 mt-2 ml-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0 mt-0.5">
              <MessageSquare className="w-3 h-3 text-indigo-400" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-indigo-400 mb-1">Admin</p>
              <div className="bg-indigo-500/8 border border-indigo-500/15 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-xs text-slate-300 leading-relaxed">
                {review.response_comment}
              </div>
            </div>
          </div>
        )}

        {/* Respond form */}
        {responding && (
          <RespondForm review={review} householdId={householdId} onDone={() => setResponding(false)} />
        )}
      </div>
    </div>
  )
}

export default function ReviewsPanel({ householdId, currentUserId, members }: Props) {
  const [expanded,         setExpanded]         = useState(true)
  const [historyExpanded,  setHistoryExpanded]  = useState(false)

  const isAdmin = members.find(m => m.user_id === currentUserId)?.role === 'admin'

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['reviews', householdId],
    queryFn:  () => fetchReviews(householdId),
    enabled:  !!householdId,
  })

  const active  = reviews.filter(r => r.status === 'pendiente' || r.status === 'respondida')
  const closed  = reviews.filter(r => r.status === 'resuelta'  || r.status === 'descartada')
  const pending = reviews.filter(r => r.status === 'pendiente')

  const commonProps = { householdId, currentUserId, isAdmin, members }

  return (
    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl sm:rounded-3xl backdrop-blur-sm overflow-hidden">

      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-amber-500/10 rounded-lg flex items-center justify-center">
            <Flag className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">Reviews de gastos</span>
          {pending.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {pending.length} pendiente{pending.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        isLoading ? (
          <div className="flex justify-center py-10 border-t border-slate-800/50">
            <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-10 text-center border-t border-slate-800/50">
            <div className="w-10 h-10 bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Flag className="w-4 h-4 text-slate-600" />
            </div>
            <p className="text-xs text-slate-600">Sin reviews en este período</p>
          </div>
        ) : (
          <>
            {/* ── Activas (pendientes + respondidas) ── */}
            {active.length > 0 && (
              <div className="border-t border-slate-800/50">
                <div className="px-5 py-2.5 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    Activas · {active.length}
                  </span>
                </div>
                <div className="px-5 pb-5 space-y-5">
                  {active.map(r => (
                    <ReviewThread key={r.id} review={r} {...commonProps} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Cerradas (resueltas + descartadas) ── */}
            {closed.length > 0 && (
              <div className="border-t border-slate-800/50">
                <button
                  onClick={() => setHistoryExpanded(e => !e)}
                  className="w-full px-5 py-2.5 flex items-center justify-between hover:bg-slate-800/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Historial · {closed.length}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-200 ${historyExpanded ? 'rotate-180' : ''}`} />
                </button>
                {historyExpanded && (
                  <div className="px-5 pb-5 space-y-5 opacity-70">
                    {closed.map(r => (
                      <ReviewThread key={r.id} review={r} {...commonProps} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
