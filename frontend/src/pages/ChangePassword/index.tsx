import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../services/api'

export default function ChangePassword() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const isForced = user?.must_change_password

  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.next !== form.confirm) {
      setError('As senhas não coincidem.')
      return
    }
    if (form.next.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }
    setLoading(true)
    try {
      await authApi.changePassword(form.current, form.next)
      await refreshUser()
      navigate('/')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Erro ao alterar senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="card max-w-sm w-full space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gov-blue/10 dark:bg-gov-blue/20 rounded-lg flex items-center justify-center">
            <KeyRound size={20} className="text-gov-blue" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isForced ? 'Defina sua nova senha' : 'Alterar senha'}
            </h1>
            {isForced ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                É necessário definir uma nova senha antes de continuar.
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {user?.full_name}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Senha atual
            </label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
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
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
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
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
            {loading ? 'Salvando...' : 'Alterar senha'}
          </button>
        </form>

        {!isForced && (
          <button
            onClick={() => navigate(-1)}
            className="w-full text-center text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}
