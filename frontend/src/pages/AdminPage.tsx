import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Trash2, TrendingUp, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getUsers, deleteUser } from '../api/admin'
import type { AdminUser } from '../api/admin'
import { useAuthStore } from '../store/authStore'

export default function AdminPage() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const qc = useQueryClient()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: getUsers,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setConfirmId(null)
    },
  })

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="force-dark min-h-screen bg-[#020817] text-white p-6">
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
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <LogOut size={16} />
          Salir
        </button>
      </div>

      {/* Stats card */}
      <div
        className="rounded-2xl p-5 mb-6 flex items-center gap-4"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Users size={20} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-2xl font-bold">{users.length}</p>
          <p className="text-slate-500 text-sm">usuarios registrados</p>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Cargando usuarios…</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No hay usuarios registrados</div>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <tr>
                <th className="text-left px-5 py-3 text-slate-400 font-medium">Nombre</th>
                <th className="text-left px-5 py-3 text-slate-400 font-medium">Email</th>
                <th className="text-left px-5 py-3 text-slate-400 font-medium">Registro</th>
                <th className="text-right px-5 py-3 text-slate-400 font-medium">Transacciones</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u: AdminUser, i: number) => (
                <tr
                  key={u.id}
                  style={{ borderBottom: i < users.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                >
                  <td className="px-5 py-4 font-medium">{u.name}</td>
                  <td className="px-5 py-4 text-slate-400">{u.email}</td>
                  <td className="px-5 py-4 text-slate-400">
                    {new Date(u.created_at).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-4 text-right text-slate-400">{u.tx_count}</td>
                  <td className="px-5 py-4 text-right">
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
                        <button
                          onClick={() => setConfirmId(null)}
                          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(u.id)}
                        className="text-slate-600 hover:text-rose-400 transition-colors"
                      >
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
