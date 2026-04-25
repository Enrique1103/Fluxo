import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Trash2, TrendingUp, LogOut, Search, X,
  ToggleLeft, ToggleRight, ChevronRight,
  UserPlus, Activity, BarChart2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getUsers, getStats, getUserDetail, toggleUserActive, deleteUser } from '../api/admin'
import type { AdminUser } from '../api/admin'
import { useAuthStore } from '../store/authStore'

type Filter = 'all' | 'active' | 'inactive'

// ── Mini bar chart ────────────────────────────────────────────────────────────
function BarChart({ data, color }: { data: { month: string; count: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-1.5 h-16">
      {data.map(({ month, count }) => (
        <div key={month} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-sm transition-all"
            style={{ height: `${Math.max((count / max) * 52, count > 0 ? 4 : 2)}px`, background: color, opacity: count > 0 ? 1 : 0.2 }}
          />
          <span className="text-slate-500 text-[10px] leading-none">{month}</span>
        </div>
      ))}
    </div>
  )
}

// ── User detail modal ─────────────────────────────────────────────────────────
function DetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-user-detail', userId],
    queryFn: () => getUserDetail(userId),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 z-10"
        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
          <X size={18} />
        </button>

        {isLoading || !data ? (
          <div className="py-8 text-center text-slate-500 text-sm">Cargando…</div>
        ) : (
          <>
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-lg font-bold">{data.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${data.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                  {data.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <p className="text-slate-400 text-sm">{data.email}</p>
              <p className="text-slate-500 text-xs mt-1">
                Registrado el {new Date(data.created_at).toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
              {data.last_activity && (
                <p className="text-slate-500 text-xs mt-0.5">
                  Última actividad: {new Date(data.last_activity).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Transacciones', value: data.tx_count },
                { label: 'Cuentas',       value: data.account_count },
                { label: 'Categorías',    value: data.category_count },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-xl font-bold">{value}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate  = useNavigate()
  const logout    = useAuthStore((s) => s.logout)
  const qc        = useQueryClient()

  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [detailId,  setDetailId]  = useState<string | null>(null)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState<Filter>('all')

  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: getUsers })
  const { data: stats }                 = useQuery({ queryKey: ['admin-stats'], queryFn: getStats })

  const toggleMutation = useMutation({
    mutationFn: toggleUserActive,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setConfirmId(null) },
  })

  const filtered = useMemo(() => {
    let list = users
    if (filter === 'active')   list = list.filter(u => u.is_active)
    if (filter === 'inactive') list = list.filter(u => !u.is_active)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    }
    return list
  }, [users, filter, search])

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  return (
    <div className="force-dark min-h-screen bg-[#020817] text-white p-6">
      {detailId && <DetailModal userId={detailId} onClose={() => setDetailId(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(34,211,238,0.1))', border: '1px solid rgba(52,211,153,0.2)' }}
          >
            <TrendingUp size={20} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Panel Admin · Fluxo</h1>
            <p className="text-slate-500 text-xs">Gestión de usuarios</p>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
          <LogOut size={16} /> Salir
        </button>
      </div>

      {/* Stats cards — row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Total usuarios',      value: stats?.total_users        ?? users.length, icon: <Users    size={17} className="text-emerald-400" />, accent: 'emerald' },
          { label: 'Activos',             value: stats?.active_users       ?? users.filter(u=>u.is_active).length, icon: <ToggleRight size={17} className="text-sky-400" />,     accent: 'sky'     },
          { label: 'Nuevos (30 días)',     value: stats?.new_users_30d      ?? '—',          icon: <UserPlus  size={17} className="text-violet-400" />, accent: 'violet'  },
          { label: 'Transacciones (30d)', value: stats?.transactions_30d   ?? '—',          icon: <Activity  size={17} className="text-amber-400"  />, accent: 'amber'   },
        ].map(({ label, value, icon, accent }) => (
          <div key={label} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className={`w-9 h-9 rounded-xl bg-${accent}-500/10 flex items-center justify-center shrink-0`}>{icon}</div>
            <div>
              <p className="text-xl font-bold leading-none">{value}</p>
              <p className="text-slate-500 text-xs mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {[
            { title: 'Usuarios nuevos por mes',    data: stats.users_by_month,        color: 'rgba(52,211,153,0.7)',  icon: <Users   size={14} className="text-emerald-400" /> },
            { title: 'Transacciones por mes',      data: stats.transactions_by_month, color: 'rgba(99,179,237,0.7)',  icon: <BarChart2 size={14} className="text-sky-400" />  },
          ].map(({ title, data, color, icon }) => (
            <div key={title} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2 mb-3">
                {icon}
                <span className="text-xs text-slate-400 font-medium">{title}</span>
                <span className="ml-auto text-slate-500 text-xs">últimos 6 meses</span>
              </div>
              <BarChart data={data} color={color} />
            </div>
          ))}
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="w-full bg-slate-800/60 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex rounded-xl overflow-hidden border border-slate-700">
          {(['all', 'active', 'inactive'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2.5 text-xs font-medium transition-colors ${filter === f ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}
            >
              {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Inactivos'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-x-auto" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Cargando usuarios…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Sin resultados</div>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <tr>
                <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Nombre</th>
                <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Email</th>
                <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Registro</th>
                <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Última actividad</th>
                <th className="text-right px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Transacciones</th>
                <th className="text-center px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u: AdminUser, i: number) => (
                <tr
                  key={u.id}
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                >
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setDetailId(u.id)}
                      className="flex items-center gap-1 font-medium hover:text-emerald-400 transition-colors group whitespace-nowrap"
                    >
                      {u.name}
                      <ChevronRight size={13} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
                    </button>
                  </td>
                  <td className="px-5 py-4 text-slate-400 whitespace-nowrap">{u.email}</td>
                  <td className="px-5 py-4 text-slate-400 whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {u.last_activity
                      ? <span className="text-slate-300">{new Date(u.last_activity).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      : <span className="text-slate-600 text-xs">Sin actividad</span>
                    }
                  </td>
                  <td className="px-5 py-4 text-right text-slate-400">{u.tx_count}</td>
                  <td className="px-5 py-4 text-center">
                    <button
                      onClick={() => toggleMutation.mutate(u.id)}
                      disabled={toggleMutation.isPending}
                      title={u.is_active ? 'Desactivar' : 'Activar'}
                      className="disabled:opacity-50 transition-opacity"
                    >
                      {u.is_active
                        ? <ToggleRight size={22} className="text-emerald-400 hover:text-emerald-300 transition-colors" />
                        : <ToggleLeft  size={22} className="text-slate-600 hover:text-slate-400 transition-colors" />
                      }
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    {confirmId === u.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-slate-400">¿Confirmar?</span>
                        <button
                          onClick={() => deleteMutation.mutate(u.id)}
                          disabled={deleteMutation.isPending}
                          className="text-xs bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg px-3 py-1 hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                        >
                          Sí, borrar
                        </button>
                        <button onClick={() => setConfirmId(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmId(u.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
