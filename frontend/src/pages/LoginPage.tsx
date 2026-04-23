import { useEffect, useRef, useState, forwardRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, TrendingUp } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '../store/authStore'
import { login, register } from '../api/auth'

// ── Canvas ─────────────────────────────────────────────────────────────────────

function TradingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W
    canvas.height = H

    let target = { x: W / 2, y: H / 2 }
    let mouse  = { x: W / 2, y: H / 2 }
    let t = 0
    let raf: number
    const N = 120

    const onMove   = (e: MouseEvent) => { target = { x: e.clientX, y: e.clientY } }
    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W; canvas.height = H
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('resize', onResize)

    const stroke = (
      offsetY: number, color: string, lw: number,
      speed: number, amp: number, pf: number,
      px: number, py: number
    ) => {
      ctx.beginPath()
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * W
        const base = H * 0.72 - (i / N) * (H * 0.38)
        const y = base
          + Math.sin(i * 0.08 + t * speed) * amp
          + Math.cos(i * 0.05 - t * speed * 0.7) * (amp * 1.4)
          + Math.sin(i * 0.18 + t * speed * 1.1) * (amp * 0.4)
          + offsetY
        i === 0
          ? ctx.moveTo(x + px * pf, y + py * pf)
          : ctx.lineTo(x + px * pf, y + py * pf)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = lw
      ctx.stroke()
    }

    const render = () => {
      mouse.x += (target.x - mouse.x) * 0.04
      mouse.y += (target.y - mouse.y) * 0.04
      const px = (mouse.x - W / 2) * 0.04
      const py = (mouse.y - H / 2) * 0.04

      ctx.clearRect(0, 0, W, H)

      // Grid
      ctx.beginPath()
      for (let x = 0; x <= W; x += 70) { ctx.moveTo(x + px * 0.15, 0); ctx.lineTo(x + px * 0.15, H) }
      for (let y = 0; y <= H; y += 70) { ctx.moveTo(0, y + py * 0.15); ctx.lineTo(W, y + py * 0.15) }
      ctx.strokeStyle = 'rgba(148,163,184,0.04)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Emerald wave — glow stack
      stroke(0, 'rgba(52,211,153,0.03)', 18, 0.28, 30, 0.07, px, py)
      stroke(0, 'rgba(52,211,153,0.07)', 8,  0.28, 30, 0.07, px, py)
      stroke(0, 'rgba(52,211,153,0.18)', 3,  0.28, 30, 0.07, px, py)
      stroke(0, 'rgba(52,211,153,0.75)', 1.5,0.28, 30, 0.07, px, py)

      // Cyan secondary
      stroke(55, 'rgba(34,211,238,0.04)', 12, 0.17, 22, 0.045, px, py)
      stroke(55, 'rgba(34,211,238,0.12)', 2,  0.17, 22, 0.045, px, py)
      stroke(55, 'rgba(34,211,238,0.55)', 1,  0.17, 22, 0.045, px, py)

      // Rose accent (expenses)
      stroke(90, 'rgba(251,113,133,0.03)', 8,  0.22, 18, 0.035, px, py)
      stroke(90, 'rgba(251,113,133,0.35)', 0.8,0.22, 18, 0.035, px, py)

      t += 0.007
      raf = requestAnimationFrame(render)
    }

    render()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-30" />
}

// ── Schemas ────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, 'Campo requerido').refine(
    v => v === 'admin' || z.string().email().safeParse(v).success,
    { message: 'Email inválido' }
  ),
  password: z.string().min(1, 'Campo requerido'),
})
const registerSchema = z.object({
  name:     z.string().min(2, 'Mínimo 2 caracteres'),
  email:    z.string().email('Email inválido'),
  password: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .max(20, 'Máximo 20 caracteres')
    .regex(/[a-z]/, 'Debe tener al menos una minúscula')
    .regex(/[A-Z]/, 'Debe tener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe tener al menos un número')
    .regex(/[@$!%*?&]/, 'Debe tener al menos un carácter especial (@$!%*?&)'),
})

type LoginForm    = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [isLogin, setIsLogin]       = useState(true)
  const [showPass, setShowPass]     = useState(false)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const navigate  = useNavigate()
  const authLogin = useAuthStore((s) => s.login)

  const lf = useForm<LoginForm>   ({ resolver: zodResolver(loginSchema),    mode: 'onChange' })
  const rf = useForm<RegisterForm>({ resolver: zodResolver(registerSchema), mode: 'onChange' })
  const emailValue = lf.watch('email')

  function parseError(err: any, fallback: string): string {
    if (!err?.response) return 'No se pudo conectar con el servidor'
    const detail = err.response.data?.detail
    if (!detail) return fallback
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((e: any) => e.msg ?? e).join('. ')
    return fallback
  }

  const onLogin = async (data: LoginForm) => {
    setError(''); setLoading(true)
    try {
      const res = await login({ username: data.email, password: data.password })
      authLogin(res.access_token, res.is_admin)
      navigate(res.is_admin ? '/admin' : '/', { replace: true })
    } catch (err: any) {
      setError(parseError(err, 'Credenciales inválidas'))
    } finally {
      setLoading(false)
    }
  }

  const onRegister = async (data: RegisterForm) => {
    setError(''); setLoading(true)
    try {
      await register({ name: data.name, email: data.email, password: data.password })
    } catch (err: any) {
      setError(parseError(err, 'Error al crear la cuenta'))
      setLoading(false)
      return
    }
    try {
      const res = await login({ username: data.email, password: data.password })
      authLogin(res.access_token, res.is_admin); navigate('/')
    } catch {
      switchMode(true)
      setError('Cuenta creada. Ya podés iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (to: boolean) => { setIsLogin(to); setError(''); setShowPass(false) }

  return (
    <div className="force-dark relative min-h-screen bg-[#020817] flex items-center justify-center overflow-hidden">

      {/* Animated canvas */}
      <TradingCanvas />

      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.07) 0%, transparent 65%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full animate-pulse-glow delay-300"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 65%)' }} />
      </div>


      {/* Main card */}
      <div className="relative z-10 w-full max-w-[420px] px-5">

        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-emerald-sm"
            style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(34,211,238,0.1))', border: '1px solid rgba(52,211,153,0.2)' }}>
            <TrendingUp size={26} className="text-emerald-400" />
          </div>
          <h1 className="text-[42px] font-black tracking-tighter leading-none mb-2">
            <span className="text-white">Fl</span>
            <span className="text-gradient-emerald">ujo</span>
          </h1>
          <p className="text-slate-500 text-xs tracking-[0.2em] uppercase font-medium">
            Domina tu flujo · Atrae abundancia
          </p>
        </div>

        {/* Toggle */}
        <div className="animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <div className="relative flex card-glass rounded-2xl p-1 mb-5 gap-1">
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 rounded-xl transition-all duration-300 ease-in-out"
              style={{
                left:  isLogin ? '4px' : 'calc(50% + 2px)',
                right: isLogin ? 'calc(50% + 2px)' : '4px',
                background: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(34,211,238,0.1))',
                border: '1px solid rgba(52,211,153,0.2)',
              }}
            />
            <button
              onClick={() => switchMode(true)}
              className={`relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 z-10 ${
                isLogin ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => switchMode(false)}
              className={`relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 z-10 ${
                !isLogin ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Registrarse
            </button>
          </div>
        </div>

        {/* Form card */}
        <div
          className="card-glass rounded-3xl p-8 animate-fade-in-up"
          style={{
            animationDelay: '0.25s',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {isLogin ? (
            <form onSubmit={lf.handleSubmit(onLogin)} className="space-y-4" key="login">
              <Field icon={<Mail size={15}/>} placeholder="Email" type={emailValue === 'admin' ? 'text' : 'email'}
                error={lf.formState.errors.email?.message} {...lf.register('email')} />
              <Field icon={<Lock size={15}/>} placeholder="Contraseña"
                type={showPass ? 'text' : 'password'}
                error={lf.formState.errors.password?.message}
                suffix={<EyeToggle show={showPass} onToggle={() => setShowPass(!showPass)} />}
                {...lf.register('password')}
              />
              {error && <ErrorMsg msg={error} />}
              <SubmitBtn loading={loading} label="Iniciar sesión" />
            </form>
          ) : (
            <form onSubmit={rf.handleSubmit(onRegister)} className="space-y-4" key="register">
              <Field icon={<User size={15}/>} placeholder="Tu nombre" type="text"
                error={rf.formState.errors.name?.message} {...rf.register('name')} />
              <Field icon={<Mail size={15}/>} placeholder="Email" type="email"
                error={rf.formState.errors.email?.message} {...rf.register('email')} />
              <Field icon={<Lock size={15}/>} placeholder="Contraseña"
                type={showPass ? 'text' : 'password'}
                error={rf.formState.errors.password?.message}
                suffix={<EyeToggle show={showPass} onToggle={() => setShowPass(!showPass)} />}
                {...rf.register('password')}
              />
              {error && <ErrorMsg msg={error} />}
              <SubmitBtn loading={loading} label="Crear mi cuenta" />
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6 animate-fade-in" style={{ animationDelay: '0.5s' }}>
          Tus datos están protegidos con cifrado de extremo a extremo
        </p>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon:    React.ReactNode
  error?:  string
  suffix?: React.ReactNode
}

const Field = forwardRef<HTMLInputElement, FieldProps>(({ icon, error, suffix, ...props }, ref) => (
  <div className="space-y-1">
    <div className={`group flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all duration-200 ${
      error
        ? 'bg-rose-500/5 border border-rose-500/30'
        : 'bg-slate-800/50 border border-slate-700/60 focus-within:border-emerald-500/40 focus-within:bg-slate-800/80'
    }`}>
      <span className={`shrink-0 transition-colors ${error ? 'text-rose-400' : 'text-slate-500 group-focus-within:text-emerald-400'}`}>
        {icon}
      </span>
      <input
        ref={ref}
        className="flex-1 bg-transparent text-white placeholder-slate-600 text-sm outline-none"
        {...props}
      />
      {suffix}
    </div>
    {error && (
      <p className="text-rose-400 text-[11px] ml-1 flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-rose-400 inline-block" />
        {error}
      </p>
    )}
  </div>
))

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className="text-slate-600 hover:text-slate-300 transition-colors shrink-0">
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
      <p className="text-rose-400 text-xs">{msg}</p>
    </div>
  )
}

function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group relative w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden mt-1"
      style={{
        background: 'linear-gradient(135deg, #34d399, #22d3ee)',
        color: '#020817',
        boxShadow: loading ? 'none' : '0 0 24px rgba(52,211,153,0.3), 0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* Shimmer overlay */}
      <span
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1), transparent 50%, rgba(255,255,255,0.05))' }}
      />
      {loading ? (
        <span className="w-4 h-4 border-2 border-[#020817]/30 border-t-[#020817] rounded-full animate-spin" />
      ) : (
        <>
          <span className="relative">{label}</span>
          <ArrowRight size={16} className="relative transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  )
}
