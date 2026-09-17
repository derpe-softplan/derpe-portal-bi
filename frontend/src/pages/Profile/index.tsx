import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Mail, KeyRound, Shield, ChevronLeft, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../services/api'
import PortalLayout from '../../layouts/PortalLayout'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  publisher: 'Publicador',
  viewer: 'Visualizador',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  publisher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
  })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState(false)

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess(false)
    if (!profileForm.full_name.trim()) {
      setProfileError('O nome completo é obrigatório.')
      return
    }
    setProfileLoading(true)
    try {
      await authApi.updateProfile({
        full_name: profileForm.full_name.trim(),
        email: profileForm.email.trim() || undefined,
      })
      await refreshUser()
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch {
      setProfileError('Erro ao atualizar perfil. Tente novamente.')
    } finally {
      setProfileLoading(false)
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)
    if (pwForm.next !== pwForm.confirm) {
      setPwError('As senhas não coincidem.')
      return
    }
    if (pwForm.next.length < 8) {
      setPwError('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }
    setPwLoading(true)
    try {
      await authApi.changePassword(pwForm.current, pwForm.next)
      await refreshUser()
      setPwForm({ current: '', next: '', confirm: '' })
      setPwSuccess(true)
      setTimeout(() => setPwSuccess(false), 3000)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPwError(detail ?? 'Senha atual incorreta ou erro ao alterar.')
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <PortalLayout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Meu Perfil</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Visualize e edite suas informações de acesso
            </p>
          </div>
        </div>

        {/* ── Info de conta (somente leitura) */}
        <div className="card mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gov-blue/10 dark:bg-gov-blue/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield size={18} className="text-gov-blue" />
            </div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Conta</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
                Usuário (login)
              </p>
              <p className="text-sm font-mono text-gray-800 dark:text-gray-200">
                {user?.username ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
                Perfil de acesso
              </p>
              <span
                className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                  ROLE_COLORS[user?.role ?? 'viewer']
                }`}
              >
                {ROLE_LABELS[user?.role ?? 'viewer'] ?? user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* ── Dados pessoais (editável) */}
        <div className="card mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <User size={18} className="text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              Dados pessoais
            </h2>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Nome completo
              </label>
              <input
                type="text"
                className="input"
                value={profileForm.full_name}
                onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))}
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Mail size={13} />
                  E-mail
                  <span className="text-gray-400 dark:text-gray-500 font-normal">(opcional)</span>
                </span>
              </label>
              <input
                type="email"
                className="input"
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                autoComplete="email"
                placeholder="seu@email.com"
              />
            </div>

            {profileError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                <Check size={15} />
                Perfil atualizado com sucesso!
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={profileLoading}
                className="btn-primary px-6"
              >
                {profileLoading ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Alterar senha */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <KeyRound size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              Alterar senha
            </h2>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Senha atual
              </label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={pwForm.current}
                onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Nova senha
              </label>
              <input
                type="password"
                className="input"
                placeholder="Mínimo 8 caracteres"
                value={pwForm.next}
                onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
                required
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Confirmar nova senha
              </label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={pwForm.confirm}
                onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                required
                autoComplete="new-password"
              />
            </div>

            {pwError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
                {pwError}
              </div>
            )}

            {pwSuccess && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                <Check size={15} />
                Senha alterada com sucesso!
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pwLoading}
                className="btn-primary px-6"
              >
                {pwLoading ? 'Alterando...' : 'Alterar senha'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </PortalLayout>
  )
}
