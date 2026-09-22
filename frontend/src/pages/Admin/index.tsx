import React, { useEffect, useState, useCallback } from 'react'
import ConfirmModal from '../../components/ConfirmModal'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  adminApi,
  parseUTC,
  resolveImageUrl,
  ReportAdmin,
  RefreshLog,
  UserAdmin,
} from '../../services/api'
import {
  Plus,
  Users,
  FileBarChart,
  Layers,
  Check,
  X,
  RefreshCw,
  Clock,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Settings,
  Archive,
  Globe,
  Send,
  RotateCcw,
  ScrollText,
  KeyRound,
} from 'lucide-react'
import clsx from 'clsx'

// ── Cron helpers ──────────────────────────────────────────────────────────────
type Freq = 'daily' | 'weekdays' | 'weekly' | 'monthly'
interface CronState {
  freq: Freq
  hour: number
  minute: number
  weekdays: number[]
  monthDay: number
}

function parseCron(cron: string): CronState {
  const [min, hr, dom, , dow] = cron.trim().split(/\s+/)
  const hour = parseInt(hr),
    minute = parseInt(min)
  if (dom !== '*') return { freq: 'monthly', hour, minute, weekdays: [1], monthDay: parseInt(dom) }
  if (dow === '*') return { freq: 'daily', hour, minute, weekdays: [1, 2, 3, 4, 5], monthDay: 1 }
  if (dow === '1-5')
    return { freq: 'weekdays', hour, minute, weekdays: [1, 2, 3, 4, 5], monthDay: 1 }
  return { freq: 'weekly', hour, minute, weekdays: dow.split(',').map(Number), monthDay: 1 }
}

function buildCron({ freq, hour, minute, weekdays, monthDay }: CronState): string {
  const h = hour,
    m = minute
  if (freq === 'daily') return `${m} ${h} * * *`
  if (freq === 'weekdays') return `${m} ${h} * * 1-5`
  if (freq === 'weekly') return `${m} ${h} * * ${[...weekdays].sort().join(',')}`
  return `${m} ${h} ${monthDay} * *`
}

function describeCron(s: CronState): string {
  const t = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
  const DAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  if (s.freq === 'daily') return `Todo dia às ${t}`
  if (s.freq === 'weekdays') return `Dias úteis (seg–sex) às ${t}`
  if (s.freq === 'weekly')
    return `Toda semana em ${s.weekdays.map((d) => DAY[d]).join(', ')} às ${t}`
  const ord = s.monthDay === 1 ? '1º' : `${s.monthDay}º`
  return `Todo mês no dia ${ord} às ${t}`
}

type Tab = 'users' | 'groups' | 'reports'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  published: 'Publicado',
  archived: 'Arquivado',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  publisher: 'Publicador',
  viewer: 'Visualizador',
}

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.users.list().then((r) => r.data),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', full_name: '', password: '', role: 'viewer' })

  const createUser = useMutation({
    mutationFn: () => adminApi.users.create({ ...form, email: form.email || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setShowForm(false)
      setForm({ username: '', email: '', full_name: '', password: '', role: 'viewer' })
    },
  })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ username: '', email: '', full_name: '', role: '', password: '', can_edit_cronograma: false })

  const openEdit = (u: UserAdmin) => {
    setEditingId(u.id)
    setEditForm({ username: u.username ?? '', email: u.email ?? '', full_name: u.full_name, role: u.role, password: '', can_edit_cronograma: u.can_edit_cronograma })
  }

  const saveUser = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof adminApi.users.update>[1] = {
        username: editForm.username || undefined,
        full_name: editForm.full_name || undefined,
        email: editForm.email || undefined,
        role: editForm.role || undefined,
        can_edit_cronograma: editForm.can_edit_cronograma,
      }
      if (editForm.password) payload.password = editForm.password
      return adminApi.users.update(editingId!, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setEditingId(null)
    },
  })

  const toggleActive = useMutation({
    mutationFn: (u: UserAdmin) => adminApi.users.update(u.id, { is_active: !u.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const resetPassword = useMutation({
    mutationFn: (id: number) => adminApi.users.resetPassword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
  const closeConfirm = useCallback(() => setConfirm(null), [])

  if (isLoading) return <Spinner />

  return (
    <div>
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Confirmar"
          variant="warning"
          onConfirm={() => { confirm.onConfirm(); closeConfirm() }}
          onCancel={closeConfirm}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Usuários</h2>
        <button
          className="btn-primary flex items-center gap-1.5 text-sm"
          onClick={() => { setShowForm(!showForm); setEditingId(null) }}
        >
          <Plus size={15} /> Novo usuário
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            className="input"
            placeholder="Nome completo"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Usuário (para login)"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          />
          <input
            className="input"
            placeholder="E-mail (opcional)"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Senha"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
          <select
            className="input"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="viewer">Visualizador</option>
            <option value="publisher">Publicador</option>
            <option value="admin">Administrador</option>
          </select>
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-primary text-sm" onClick={() => createUser.mutate()}>
              Salvar
            </button>
            <button className="btn-secondary text-sm" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700">
            <tr>
              {['Nome', 'Usuário', 'E-mail', 'Perfil', 'Ativo', ''].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {users.map((u) => (
              <React.Fragment key={u.id}>
                <tr className={clsx('hover:bg-gray-50 dark:hover:bg-gray-700/30', editingId === u.id && 'bg-blue-50 dark:bg-blue-900/20')}>
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{u.full_name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{u.username ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        u.role === 'admin'
                          ? 'bg-green-100 text-green-700'
                          : u.role === 'publisher'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <Check size={16} className="text-green-500" />
                    ) : (
                      <X size={16} className="text-red-400" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title={editingId === u.id ? 'Fechar edição' : 'Editar usuário'}
                        className={clsx(
                          'p-1.5 rounded-lg transition-colors',
                          editingId === u.id
                            ? 'text-gov-blue bg-blue-100'
                            : 'text-gray-400 hover:text-gov-blue hover:bg-blue-50'
                        )}
                        onClick={() => (editingId === u.id ? setEditingId(null) : openEdit(u))}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        title="Resetar senha (usuário definirá nova senha no próximo acesso)"
                        className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                        onClick={() => setConfirm({
                          title: 'Resetar senha',
                          message: `A senha de "${u.full_name}" será redefinida para derpe123. O usuário precisará trocá-la no próximo acesso.`,
                          onConfirm: () => resetPassword.mutate(u.id),
                        })}
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        title={u.is_active ? 'Desativar usuário' : 'Ativar usuário'}
                        className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => toggleActive.mutate(u)}
                      >
                        {u.is_active ? (
                          <ToggleRight size={18} className="text-green-500" />
                        ) : (
                          <ToggleLeft size={18} className="text-gray-300" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>

                {editingId === u.id && (
                  <tr>
                    <td colSpan={6} className="bg-blue-50 dark:bg-blue-900/20 px-4 pb-4 border-b border-blue-100 dark:border-blue-800">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Nome completo</label>
                          <input
                            className="input"
                            value={editForm.full_name}
                            onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Usuário (login)</label>
                          <input
                            className="input font-mono"
                            value={editForm.username}
                            onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">E-mail (opcional)</label>
                          <input
                            className="input"
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Perfil</label>
                          <select
                            className="input"
                            value={editForm.role}
                            onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                          >
                            <option value="viewer">Visualizador</option>
                            <option value="publisher">Publicador</option>
                            <option value="admin">Administrador</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Nova senha (deixe em branco para manter)</label>
                          <input
                            className="input"
                            type="password"
                            placeholder="••••••••"
                            value={editForm.password}
                            onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <button
                              type="button"
                              onClick={() => setEditForm((f) => ({ ...f, can_edit_cronograma: !f.can_edit_cronograma }))}
                              className="flex-shrink-0"
                            >
                              {editForm.can_edit_cronograma
                                ? <ToggleRight size={22} className="text-gov-blue" />
                                : <ToggleLeft size={22} className="text-gray-300 dark:text-gray-600" />}
                            </button>
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                              Pode editar o Cronograma
                            </span>
                          </label>
                        </div>
                        <div className="flex items-end gap-2">
                          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => saveUser.mutate()}>
                            <Check size={14} /> Salvar
                          </button>
                          <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setEditingId(null)}>
                            <X size={14} /> Cancelar
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Schedule modal ────────────────────────────────────────────────────────────
function ScheduleModal({
  report,
  onClose,
  onSaved,
}: {
  report: ReportAdmin
  onClose: () => void
  onSaved: (refresh_schedule: string | null, next_refresh_at: string | null) => void
}) {
  const qc = useQueryClient()
  const initial: CronState = report.refresh_schedule
    ? parseCron(report.refresh_schedule)
    : { freq: 'weekdays', hour: 6, minute: 0, weekdays: [1, 2, 3, 4, 5], monthDay: 1 }

  const [state, setState] = useState<CronState>(initial)
  const [saving, setSaving] = useState(false)

  const set = (patch: Partial<CronState>) => setState((s) => ({ ...s, ...patch }))

  const toggleWeekday = (d: number) =>
    set({
      weekdays: state.weekdays.includes(d)
        ? state.weekdays.filter((x) => x !== d)
        : [...state.weekdays, d],
    })

  const handleSave = async () => {
    setSaving(true)
    try {
      const cron = buildCron(state)
      const res = await adminApi.reports.updateSchedule(report.id, cron)
      onSaved(res.data.refresh_schedule, res.data.next_refresh_at ?? null)
      qc.invalidateQueries({ queryKey: ['admin-reports'] })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setSaving(true)
    try {
      await adminApi.reports.updateSchedule(report.id, null)
      onSaved(null, null)
      qc.invalidateQueries({ queryKey: ['admin-reports'] })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const HOURS = Array.from({ length: 24 }, (_, i) => i)
  const MINUTES = [0, 15, 30, 45]
  const FREQ_OPTIONS: { key: Freq; label: string; desc: string }[] = [
    { key: 'daily', label: 'Diário', desc: 'Todos os dias' },
    { key: 'weekdays', label: 'Dias úteis', desc: 'Segunda a sexta' },
    { key: 'weekly', label: 'Semanal', desc: 'Dias da semana escolhidos' },
    { key: 'monthly', label: 'Mensal', desc: 'Um dia fixo por mês' },
  ]

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Agendar atualização</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{report.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Frequência */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Frequência
            </p>
            <div className="grid grid-cols-2 gap-2">
              {FREQ_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => set({ freq: opt.key })}
                  className={clsx(
                    'text-left px-3 py-2.5 rounded-xl border-2 transition-colors',
                    state.freq === opt.key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <p
                    className={clsx(
                      'text-sm font-medium',
                      state.freq === opt.key ? 'text-blue-700' : 'text-gray-700'
                    )}
                  >
                    {opt.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Horário */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Horário
            </p>
            <div className="flex items-center gap-2">
              <select
                value={state.hour}
                onChange={(e) => set({ hour: parseInt(e.target.value) })}
                className="input w-24 text-center font-mono"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}h
                  </option>
                ))}
              </select>
              <span className="text-gray-400 font-semibold">:</span>
              <select
                value={state.minute}
                onChange={(e) => set({ minute: parseInt(e.target.value) })}
                className="input w-24 text-center font-mono"
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}min
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dias da semana (semanal) */}
          {state.freq === 'weekly' && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Dias da semana
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleWeekday(i)}
                    className={clsx(
                      'w-10 h-10 rounded-full text-xs font-semibold transition-colors',
                      state.weekdays.includes(i)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dia do mês (mensal) */}
          {state.freq === 'monthly' && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Dia do mês
              </p>
              <select
                value={state.monthDay}
                onChange={(e) => set({ monthDay: parseInt(e.target.value) })}
                className="input w-36"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    Dia {d}
                    {d === 1 ? 'º' : 'º'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Resumo */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-500 font-semibold uppercase tracking-wider mb-1">
              Resumo
            </p>
            <p className="text-sm text-blue-800 font-medium">{describeCron(state)}</p>
            <p className="text-xs text-blue-400 font-mono mt-1">{buildCron(state)}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {report.refresh_schedule ? (
            <button
              onClick={handleRemove}
              disabled={saving}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Remover agendamento
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (state.freq === 'weekly' && state.weekdays.length === 0)}
              className="btn-primary text-sm"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Refresh logs panel ────────────────────────────────────────────────────────
function RefreshLogsPanel({ reportId }: { reportId: number }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['refresh-logs', reportId],
    queryFn: () => adminApi.reports.listLogs(reportId).then((r) => r.data),
    refetchInterval: 30_000,
  })

  const [expandedError, setExpandedError] = useState<number | null>(null)

  if (isLoading)
    return <div className="py-4 text-center text-xs text-gray-400">Carregando logs...</div>
  if (!logs.length)
    return (
      <div className="py-4 text-center text-xs text-gray-400">
        Nenhuma execução registrada ainda.
      </div>
    )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="py-2 pr-4 text-left font-semibold text-gray-500 uppercase tracking-wide">
              Status
            </th>
            <th className="py-2 pr-4 text-left font-semibold text-gray-500 uppercase tracking-wide">
              Início
            </th>
            <th className="py-2 pr-4 text-left font-semibold text-gray-500 uppercase tracking-wide">
              Origem
            </th>
            <th className="py-2 pr-4 text-right font-semibold text-gray-500 uppercase tracking-wide">
              Linhas
            </th>
            <th className="py-2 text-right font-semibold text-gray-500 uppercase tracking-wide">
              Duração
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {logs.map((log: RefreshLog) => (
            <>
              <tr
                key={log.id}
                className={clsx(
                  'hover:bg-gray-50',
                  log.status === 'error' && 'bg-red-50 hover:bg-red-50'
                )}
              >
                <td className="py-2 pr-4">
                  {log.status === 'success' ? (
                    <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                      <Check size={10} /> OK
                    </span>
                  ) : (
                    <button
                      className="inline-flex items-center gap-1 text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-medium"
                      onClick={() => setExpandedError(expandedError === log.id ? null : log.id)}
                    >
                      <AlertCircle size={10} /> Erro
                      {expandedError === log.id ? (
                        <ChevronUp size={10} />
                      ) : (
                        <ChevronDown size={10} />
                      )}
                    </button>
                  )}
                </td>
                <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">
                  {parseUTC(log.started_at)?.toLocaleString('pt-BR')}
                </td>
                <td className="py-2 pr-4 text-gray-500">
                  {log.triggered_by === 'scheduler' ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={10} /> Agendado
                    </span>
                  ) : (
                    <span className="truncate max-w-[140px] block" title={log.triggered_by}>
                      {log.triggered_by}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right text-gray-600">
                  {log.row_count != null ? log.row_count.toLocaleString('pt-BR') : '—'}
                </td>
                <td className="py-2 text-right text-gray-500">
                  {log.duration_ms != null ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}
                </td>
              </tr>
              {expandedError === log.id && log.error_message && (
                <tr key={`${log.id}-err`} className="bg-red-50">
                  <td colSpan={5} className="pb-3 px-2">
                    <pre className="text-xs text-red-700 bg-red-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                      {log.error_message}
                    </pre>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Reports tab ───────────────────────────────────────────────────────────────
function ReportsTab() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => adminApi.reports.list().then((r) => r.data),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: () => adminApi.groups.list().then((r) => r.data),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.users.list().then((r) => r.data),
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      adminApi.reports.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  })

  const [refreshingId, setRefreshingId] = useState<number | null>(null)
  const [logsOpenId, setLogsOpenId] = useState<number | null>(null)
  const [schedulingReport, setSchedulingReport] = useState<ReportAdmin | null>(null)

  const refreshReport = async (id: number) => {
    setRefreshingId(id)
    try {
      await adminApi.reports.refresh(id)
      qc.invalidateQueries({ queryKey: ['admin-reports'] })
      qc.invalidateQueries({ queryKey: ['refresh-logs', id] })
      // Invalida o cache dos dados e meta do relatório para forçar refetch automático
      const slug = reports.find((r) => r.id === id)?.slug
      if (slug) {
        qc.invalidateQueries({ queryKey: ['report-data', slug] })
        qc.invalidateQueries({ queryKey: ['report-meta', slug] })
      }
    } finally {
      setRefreshingId(null)
    }
  }

  const [showForm, setShowForm] = useState(false)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    cover_image_url: '',
    slug: '',
    sql_query: '',
    chart_config: '',
  })

  const createReport = useMutation({
    mutationFn: async () => {
      const payload = { ...form }
      const created = await adminApi.reports.create(payload)

      if (coverFile) {
        const fd = new FormData()
        fd.append('file', coverFile)
        await adminApi.reports.uploadCover(created.data.id, fd)
      }

      return created
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] })
      setShowForm(false)
      setCoverFile(null)
      setForm({
        title: '',
        description: '',
        cover_image_url: '',
        slug: '',
        sql_query: '',
        chart_config: '',
      })
    },
  })

  const SISTEMAS = ['SMO', 'CQM', 'SGF', 'SCO']
  const TIPOS = ['Obras', 'Financeiro', 'Orçamento', 'Gerencial']

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingForm, setEditingForm] = useState({
    title: '',
    description: '',
    cover_image_url: '',
    slug: '',
    sistemas: [] as string[],
    tipos: [] as string[],
  })
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([])

  const { data: permissions = [] } = useQuery({
    queryKey: ['admin-report-permissions', editingId],
    enabled: editingId !== null,
    queryFn: () =>
      editingId === null
        ? Promise.resolve([])
        : adminApi.reports.listPerms(editingId).then((r) => r.data),
  })

  const openEditor = (report: ReportAdmin) => {
    setEditingId(report.id)
    setEditingForm({
      title: report.title,
      description: report.description ?? '',
      cover_image_url: report.cover_image_url ?? '',
      slug: report.slug,
      sistemas: report.sistemas ?? [],
      tipos: report.tipos ?? [],
    })
  }

  useEffect(() => {
    if (editingId === null) return

    const current = reports.find((r) => r.id === editingId)
    if (!current) return

    setEditingForm({
      title: current.title,
      description: current.description ?? '',
      cover_image_url: current.cover_image_url ?? '',
      slug: current.slug,
      sistemas: current.sistemas ?? [],
      tipos: current.tipos ?? [],
    })

    setSelectedUserIds(
      (permissions ?? [])
        .filter((p) => p.user_id !== undefined && p.user_id !== null)
        .map((p) => p.user_id as number)
    )
    setSelectedGroupIds(
      (permissions ?? [])
        .filter((p) => p.group_id !== undefined && p.group_id !== null)
        .map((p) => p.group_id as number)
    )
  }, [editingId, reports, permissions])

  const saveReportConfig = useMutation({
    mutationFn: async () => {
      if (editingId === null) return

      await adminApi.reports.update(editingId, {
        title: editingForm.title,
        description: editingForm.description,
        slug: editingForm.slug,
        sistemas: editingForm.sistemas,
        tipos: editingForm.tipos,
      })

      if (coverFile) {
        const fd = new FormData()
        fd.append('file', coverFile)
        await adminApi.reports.uploadCover(editingId, fd)
      }

      const currentPerms = permissions ?? []
      const userPermIds = new Set(
        currentPerms
          .filter((p) => p.user_id !== undefined && p.user_id !== null)
          .map((p) => p.user_id as number)
      )
      const groupPermIds = new Set(
        currentPerms
          .filter((p) => p.group_id !== undefined && p.group_id !== null)
          .map((p) => p.group_id as number)
      )

      for (const perm of currentPerms) {
        if (
          perm.user_id !== undefined &&
          perm.user_id !== null &&
          !selectedUserIds.includes(perm.user_id)
        ) {
          await adminApi.reports.removePerm(editingId, perm.id)
        }
        if (
          perm.group_id !== undefined &&
          perm.group_id !== null &&
          !selectedGroupIds.includes(perm.group_id)
        ) {
          await adminApi.reports.removePerm(editingId, perm.id)
        }
      }

      for (const userId of selectedUserIds) {
        if (!userPermIds.has(userId)) {
          await adminApi.reports.addPerm(editingId, { user_id: userId })
        }
      }

      for (const groupId of selectedGroupIds) {
        if (!groupPermIds.has(groupId)) {
          await adminApi.reports.addPerm(editingId, { group_id: groupId })
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] })
      qc.invalidateQueries({ queryKey: ['admin-report-permissions'] })
      setCoverFile(null)
      setEditingId(null)
    },
  })

  if (isLoading) return <Spinner />

  const handleScheduleSaved = (refresh_schedule: string | null, next_refresh_at: string | null) => {
    qc.setQueryData<ReportAdmin[]>(['admin-reports'], (prev = []) =>
      prev.map((r) =>
        r.id === schedulingReport?.id
          ? {
              ...r,
              refresh_schedule: refresh_schedule ?? undefined,
              next_refresh_at: next_refresh_at ?? undefined,
            }
          : r
      )
    )
  }

  const nextStatus: Record<string, string | null> = {
    draft: 'in_review',
    in_review: 'published',
    published: 'archived',
    archived: 'in_review',
  }

  const nextLabel: Record<string, string> = {
    draft: 'Enviar para revisão',
    in_review: 'Publicar',
    published: 'Arquivar',
    archived: 'Restaurar',
  }

  return (
    <div>
      {schedulingReport && (
        <ScheduleModal
          report={schedulingReport}
          onClose={() => setSchedulingReport(null)}
          onSaved={handleScheduleSaved}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Relatórios</h2>
        <button
          className="btn-primary flex items-center gap-1.5 text-sm"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={15} /> Novo relatório
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="input"
              placeholder="Título"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Slug (ex: fluxo-medicao)"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </div>
          <input
            className="input"
            placeholder="Descrição"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Imagem de capa
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gov-blue file:px-3 file:py-2 file:text-white"
            />
          </div>
          <textarea
            className="input font-mono text-xs"
            rows={8}
            placeholder="SQL Query"
            value={form.sql_query}
            onChange={(e) => setForm((f) => ({ ...f, sql_query: e.target.value }))}
          />
          <div className="flex gap-2">
            <button className="btn-primary text-sm" onClick={() => createReport.mutate()}>
              Salvar
            </button>
            <button className="btn-secondary text-sm" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {editingId !== null && (
        <div className="card p-5 mb-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Configuração do relatório</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Ajuste a capa, a descrição e os acessos</p>
            </div>
            <button className="btn-secondary text-xs" onClick={() => setEditingId(null)}>
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <input
                className="input"
                placeholder="Título"
                value={editingForm.title}
                onChange={(e) => setEditingForm((f) => ({ ...f, title: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Slug"
                value={editingForm.slug}
                onChange={(e) => setEditingForm((f) => ({ ...f, slug: e.target.value }))}
              />
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Imagem de capa
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gov-blue file:px-3 file:py-2 file:text-white"
                />
                {editingForm.cover_image_url && !coverFile && (
                  <img
                    src={resolveImageUrl(editingForm.cover_image_url, true)}
                    alt="Capa atual"
                    className="mt-3 h-28 w-full rounded-lg object-cover border border-gray-200"
                  />
                )}
              </div>
              <textarea
                className="input"
                rows={4}
                placeholder="Descrição"
                value={editingForm.description}
                onChange={(e) => setEditingForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Sistemas
                </p>
                <div className="flex flex-wrap gap-2">
                  {SISTEMAS.map((s) => (
                    <label key={s} className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm font-medium transition-colors',
                      editingForm.sistemas.includes(s)
                        ? 'bg-gov-blue text-white border-gov-blue'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-gov-blue'
                    )}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={editingForm.sistemas.includes(s)}
                        onChange={() => setEditingForm((f) => ({
                          ...f,
                          sistemas: f.sistemas.includes(s)
                            ? f.sistemas.filter((x) => x !== s)
                            : [...f.sistemas, s],
                        }))}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Tipo de relatório
                </p>
                <div className="flex flex-wrap gap-2">
                  {TIPOS.map((t) => (
                    <label key={t} className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm font-medium transition-colors',
                      editingForm.tipos.includes(t)
                        ? 'bg-gov-blue text-white border-gov-blue'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-gov-blue'
                    )}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={editingForm.tipos.includes(t)}
                        onChange={() => setEditingForm((f) => ({
                          ...f,
                          tipos: f.tipos.includes(t)
                            ? f.tipos.filter((x) => x !== t)
                            : [...f.tipos, t],
                        }))}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Perfis com acesso
                </p>
                <div className="space-y-2 max-h-40 overflow-auto pr-1">
                  {groups.map((group) => (
                    <label key={group.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={() =>
                          setSelectedGroupIds((current) =>
                            current.includes(group.id)
                              ? current.filter((id) => id !== group.id)
                              : [...current, group.id]
                          )
                        }
                      />
                      {group.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Usuários com acesso
                </p>
                <div className="space-y-2 max-h-40 overflow-auto pr-1">
                  {users.map((user) => (
                    <label key={user.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() =>
                          setSelectedUserIds((current) =>
                            current.includes(user.id)
                              ? current.filter((id) => id !== user.id)
                              : [...current, user.id]
                          )
                        }
                      />
                      {user.full_name} <span className="text-gray-400">({user.username ?? user.email})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn-primary text-sm" onClick={() => saveReportConfig.mutate()}>
              Salvar configurações
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700">
            <tr>
              {['Título', 'Status', 'Última atualização', 'Próximo refresh', ''].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {reports.map((r: ReportAdmin) => (
              <React.Fragment key={r.id}>
                <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td
                    className="px-4 py-3 cursor-pointer"
                    onClick={() => navigate(`/relatorio/${r.slug}`)}
                  >
                    <p className="font-medium text-gray-800 dark:text-gray-200 hover:text-gov-blue transition-colors">
                      {r.title}
                    </p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{r.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge-${r.status}`}>{STATUS_LABELS[r.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.last_refreshed_at ? (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Clock size={12} className="text-green-500" />
                        <span>{parseUTC(r.last_refreshed_at)?.toLocaleString('pt-BR')}</span>
                        {r.row_count != null && (
                          <span className="text-gray-400">
                            ({r.row_count.toLocaleString('pt-BR')} linhas)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        Sem dados
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.next_refresh_at ? (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <CalendarClock size={12} className="text-blue-400" />
                        <span>{new Date(r.next_refresh_at!).toLocaleString('pt-BR')}</span>
                      </div>
                    ) : r.refresh_schedule ? (
                      <span className="text-xs text-gray-400 font-mono">{r.refresh_schedule}</span>
                    ) : (
                      <span className="text-xs text-gray-300">Manual</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1.5 rounded-lg text-gov-blue hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        onClick={() => openEditor(r)}
                        title="Configurar"
                      >
                        <Settings size={15} />
                      </button>

                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => setSchedulingReport(r)}
                        title={r.refresh_schedule ? `Agendado: ${r.refresh_schedule}` : 'Agendar atualização'}
                      >
                        <CalendarClock
                          size={15}
                          className={r.refresh_schedule ? 'text-blue-400' : 'text-gray-400'}
                        />
                      </button>

                      <button
                        className={clsx(
                          'p-1.5 rounded-lg transition-colors',
                          refreshingId === r.id
                            ? 'text-gray-400 cursor-wait'
                            : 'text-gov-blue hover:bg-blue-50 dark:hover:bg-blue-900/30'
                        )}
                        onClick={() => refreshReport(r.id)}
                        disabled={refreshingId === r.id}
                        title={refreshingId === r.id ? 'Importando...' : 'Atualizar dados agora'}
                      >
                        <RefreshCw
                          size={15}
                          className={refreshingId === r.id ? 'animate-spin' : ''}
                        />
                      </button>

                      <button
                        className={clsx(
                          'p-1.5 rounded-lg transition-colors',
                          logsOpenId === r.id
                            ? 'text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700'
                            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        )}
                        onClick={() => setLogsOpenId(logsOpenId === r.id ? null : r.id)}
                        title="Ver logs"
                      >
                        <ScrollText size={15} />
                      </button>

                      {nextStatus[r.status] && (
                        <button
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onClick={() =>
                            setStatus.mutate({ id: r.id, status: nextStatus[r.status]! })
                          }
                          title={nextLabel[r.status]}
                        >
                          {r.status === 'draft' && <Send size={15} />}
                          {r.status === 'in_review' && <Globe size={15} className="text-green-500" />}
                          {r.status === 'published' && <Archive size={15} />}
                          {r.status === 'archived' && <RotateCcw size={15} className="text-blue-400" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {logsOpenId === r.id && (
                  <tr key={`${r.id}-logs`}>
                    <td colSpan={5} className="bg-gray-50 px-6 py-4 border-b border-gray-100">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                        Histórico de atualizações
                      </p>
                      <RefreshLogsPanel reportId={r.id} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Groups tab ────────────────────────────────────────────────────────────────
function GroupsTab() {
  const qc = useQueryClient()
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: () => adminApi.groups.list().then((r) => r.data),
  })
  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.users.list().then((r) => r.data),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: members = [] } = useQuery({
    queryKey: ['group-members', expandedId],
    enabled: expandedId !== null,
    queryFn: () =>
      expandedId === null
        ? Promise.resolve([] as number[])
        : adminApi.groups.listMembers(expandedId).then((r) => r.data),
  })

  const createGroup = useMutation({
    mutationFn: () => adminApi.groups.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-groups'] })
      setShowForm(false)
      setForm({ name: '', description: '' })
    },
  })

  const deleteGroup = useMutation({
    mutationFn: (id: number) => adminApi.groups.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-groups'] })
      setExpandedId(null)
    },
  })

  const toggleMember = useMutation({
    mutationFn: ({ gid, uid, add }: { gid: number; uid: number; add: boolean }) =>
      add ? adminApi.groups.addMember(gid, uid) : adminApi.groups.removeMember(gid, uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-members', expandedId] })
    },
  })

  if (isLoading) return <Spinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Grupos</h2>
        <button
          className="btn-primary flex items-center gap-1.5 text-sm"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={15} /> Novo grupo
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            className="input"
            placeholder="Nome do grupo"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Descrição (opcional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-primary text-sm" onClick={() => createGroup.mutate()}>
              Criar
            </button>
            <button className="btn-secondary text-sm" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
        {groups.length === 0 && (
          <p className="p-8 text-center text-gray-400 text-sm">Nenhum grupo cadastrado.</p>
        )}
        {groups.map((group) => (
          <div key={group.id}>
            <div
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
              onClick={() => setExpandedId(expandedId === group.id ? null : group.id)}
            >
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">{group.name}</p>
                {group.description && (
                  <p className="text-xs text-gray-400 mt-0.5">{group.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteGroup.mutate(group.id)
                  }}
                >
                  Excluir
                </button>
                {expandedId === group.id ? (
                  <ChevronUp size={16} className="text-gray-400" />
                ) : (
                  <ChevronDown size={16} className="text-gray-400" />
                )}
              </div>
            </div>

            {expandedId === group.id && (
              <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-3 mb-2">
                  Membros
                </p>
                <div className="space-y-2 max-h-60 overflow-auto">
                  {users.map((user) => {
                    const isMember = members.includes(user.id)
                    return (
                      <label
                        key={user.id}
                        className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isMember}
                          onChange={() =>
                            toggleMember.mutate({ gid: group.id, uid: user.id, add: !isMember })
                          }
                        />
                        {user.full_name}
                        <span className="text-gray-400 text-xs font-mono">
                          ({user.username ?? user.email})
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-7 h-7 border-2 border-gov-blue border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ── Main Admin ────────────────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState<Tab>('reports')

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'reports', label: 'Relatórios', icon: <FileBarChart size={16} /> },
    { key: 'users', label: 'Usuários', icon: <Users size={16} /> },
    { key: 'groups', label: 'Grupos', icon: <Layers size={16} /> },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Administração</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gerencie usuários, grupos e relatórios do portal
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-gov-blue text-gov-blue'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'reports' && <ReportsTab />}
    </div>
  )
}
