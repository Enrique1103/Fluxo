import { useState } from 'react'
import { Flag, Loader2, Trash2, MessageSquare, ChevronDown, CheckCircle2, XCircle, Clock, MessageCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchReviews, respondReview, deleteReview,
  FLAG_TYPE_LABELS, STATUS_LABELS,
} from '../../api/reviews'
import type { Review, ReviewStatus } from '../../api/reviews'
import type { HouseholdMember } from '../../api/households'

interface Props {
  householdId: string
  currentUserId: string
  members: HouseholdMember[]
}

const STATUS_STYLES: Record<ReviewStatus, string> = {
  pendiente:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  respondida: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  resuelta:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  descartada: 'bg-slate-700/50 text-slate-500 border-slate-700',
}

const STATUS_ICON: Record<ReviewStatus, React.ReactNode> = {
  pendiente:  <Clock className="w-3 h-3" />,
  respondida: <MessageCircle className="w-3 h-3" />,
  resuelta:   <CheckCircle2 className="w-3 h-3" />,
  descartada: <XCircle className="w-3 h-3" />,
}

const RESPOND_OPTIONS: { value: ReviewStatus; label: string }[] = [
  { value: 'respondida', label: 'Marcar como respondida' },
  { value: 'resuelta',   label: 'Marcar como resuelta' },
  { value: 'descartada', label: 'Descartar' },
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
    <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
      <select
        value={status}
        onChange={e => setStatus(e.target.value as ReviewStatus)}
        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500/60"
      >
        {RESPOND_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Respuesta (opcional)..."
        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60 resize-none placeholder:text-slate-600"
      />
      {mutation.isError && (
        <p className="text-[10px] text-rose-400">Error al responder. Intentá de nuevo.</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onDone}
          className="flex-1 py-1.5 rounded-xl text-xs font-medium border border-slate-700 text-slate-500 hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="flex-1 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-60 flex items-center justify-center gap-1"
        >
          {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
          Enviar
        </button>
      </div>
    </div>
  )
}

function ReviewCard({
  review,
  householdId,
  currentUserId,
  isAdmin,
  members,
}: {
  review: Review
  householdId: string
  currentUserId: string
  isAdmin: boolean
  members: HouseholdMember[]
}) {
  const qc = useQueryClient()
  const [responding, setResponding] = useState(false)

  const authorName = members.find(m => m.user_id === review.flagged_by_user_id)?.user_name ?? 'Miembro'
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
    <div className="px-4 py-3 border-b border-slate-800/50 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Badge de tipo + status */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {FLAG_TYPE_LABELS[review.flag_type]}
            </span>
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[review.status]}`}>
              {STATUS_ICON[review.status]}
              {STATUS_LABELS[review.status]}
            </span>
          </div>

          {/* Autor y fecha */}
          <p className="text-[10px] text-slate-500">
            <span className="font-medium text-slate-400">{authorName}</span>
            {' · '}{dateStr}
          </p>

          {/* Comentario */}
          {review.comment && (
            <p className="mt-1.5 text-xs text-slate-400 bg-slate-800/60 rounded-xl px-3 py-2">
              {review.comment}
            </p>
          )}

          {/* Respuesta */}
          {review.response_comment && (
            <div className="mt-2 pl-3 border-l-2 border-indigo-500/30">
              <p className="text-[10px] text-indigo-400 font-semibold mb-0.5">Respuesta del admin</p>
              <p className="text-xs text-slate-400">{review.response_comment}</p>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1 shrink-0">
          {canRespond && !responding && (
            <button
              onClick={() => setResponding(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            >
              <MessageSquare className="w-3 h-3" />
              Responder
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
            >
              {deleteMutation.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Trash2 className="w-3 h-3" />
              }
            </button>
          )}
        </div>
      </div>

      {responding && (
        <RespondForm
          review={review}
          householdId={householdId}
          onDone={() => setResponding(false)}
        />
      )}
    </div>
  )
}

const FILTER_OPTIONS: { value: ReviewStatus | 'all'; label: string }[] = [
  { value: 'all',        label: 'Todas' },
  { value: 'pendiente',  label: 'Pendientes' },
  { value: 'respondida', label: 'Respondidas' },
  { value: 'resuelta',   label: 'Resueltas' },
  { value: 'descartada', label: 'Descartadas' },
]

export default function ReviewsPanel({ householdId, currentUserId, members }: Props) {
  const [filter, setFilter]     = useState<ReviewStatus | 'all'>('all')
  const [expanded, setExpanded] = useState(true)

  const isAdmin = members.find(m => m.user_id === currentUserId)?.role === 'admin'

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['reviews', householdId, filter === 'all' ? undefined : filter],
    queryFn:  () => fetchReviews(householdId, filter === 'all' ? undefined : filter),
    enabled:  !!householdId,
  })

  const pendingCount = reviews.filter(r => r.status === 'pendiente').length

  return (
    <div className="rounded-3xl border overflow-hidden bg-slate-900 border-slate-800">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Flag className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-slate-200">Reviews de gastos</span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <>
          {/* Filtros */}
          <div className="px-4 pb-3 border-b border-slate-800 flex gap-1.5 flex-wrap">
            {FILTER_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setFilter(o.value)}
                className={`px-3 py-1 rounded-xl text-[10px] font-semibold border transition-all ${
                  filter === o.value
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="py-8 text-center">
              <Flag className="w-5 h-5 text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-600">
                {filter === 'all' ? 'Sin reviews en este período' : `Sin reviews ${STATUS_LABELS[filter as ReviewStatus]?.toLowerCase()}`}
              </p>
            </div>
          ) : (
            <div>
              {reviews.map(r => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  householdId={householdId}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  members={members}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
