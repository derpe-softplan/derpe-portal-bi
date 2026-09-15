import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { adminApi, parseUTC, resolveImageUrl, ReportAdmin, RefreshLog, UserAdmin } from "../../services/api";
import {
  Plus, Users, FileBarChart, Layers,
  Check, X, RefreshCw, Clock, CalendarClock, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import clsx from "clsx";

// ── Cron helpers ──────────────────────────────────────────────────────────────
type Freq = "daily" | "weekdays" | "weekly" | "monthly";
interface CronState { freq: Freq; hour: number; minute: number; weekdays: number[]; monthDay: number }

function parseCron(cron: string): CronState {
  const [min, hr, dom, , dow] = cron.trim().split(/\s+/);
  const hour = parseInt(hr), minute = parseInt(min);
  if (dom !== "*") return { freq: "monthly", hour, minute, weekdays: [1], monthDay: parseInt(dom) };
  if (dow === "*") return { freq: "daily", hour, minute, weekdays: [1, 2, 3, 4, 5], monthDay: 1 };
  if (dow === "1-5") return { freq: "weekdays", hour, minute, weekdays: [1, 2, 3, 4, 5], monthDay: 1 };
  return { freq: "weekly", hour, minute, weekdays: dow.split(",").map(Number), monthDay: 1 };
}

function buildCron({ freq, hour, minute, weekdays, monthDay }: CronState): string {
  const h = hour, m = minute;
  if (freq === "daily")    return `${m} ${h} * * *`;
  if (freq === "weekdays") return `${m} ${h} * * 1-5`;
  if (freq === "weekly")   return `${m} ${h} * * ${[...weekdays].sort().join(",")}`;
  return `${m} ${h} ${monthDay} * *`;
}

function describeCron(s: CronState): string {
  const t = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
  const DAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  if (s.freq === "daily")    return `Todo dia às ${t}`;
  if (s.freq === "weekdays") return `Dias úteis (seg–sex) às ${t}`;
  if (s.freq === "weekly")   return `Toda semana em ${s.weekdays.map(d => DAY[d]).join(", ")} às ${t}`;
  const ord = s.monthDay === 1 ? "1º" : `${s.monthDay}º`;
  return `Todo mês no dia ${ord} às ${t}`;
}

type Tab = "users" | "groups" | "reports";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  published: "Publicado",
  archived: "Arquivado",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  publisher: "Publicador",
  viewer: "Visualizador",
};

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.users.list().then((r) => r.data),
  });

  const toggleActive = useMutation({
    mutationFn: (u: UserAdmin) => adminApi.users.update(u.id, { is_active: !u.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "viewer" });

  const createUser = useMutation({
    mutationFn: () => adminApi.users.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setShowForm(false);
      setForm({ email: "", full_name: "", password: "", role: "viewer" });
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Usuários</h2>
        <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={15} /> Novo usuário
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Nome completo" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          <input className="input" placeholder="E-mail" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input className="input" placeholder="Senha" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            <option value="viewer">Visualizador</option>
            <option value="publisher">Publicador</option>
            <option value="admin">Administrador</option>
          </select>
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-primary text-sm" onClick={() => createUser.mutate()}>Salvar</button>
            <button className="btn-secondary text-sm" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Nome", "E-mail", "Perfil", "Ativo", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{u.full_name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                    u.role === "admin" ? "bg-green-100 text-green-700" :
                    u.role === "publisher" ? "bg-yellow-100 text-yellow-700" :
                    "bg-gray-100 text-gray-600"
                  )}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.is_active
                    ? <Check size={16} className="text-green-500" />
                    : <X size={16} className="text-red-400" />}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    onClick={() => toggleActive.mutate(u)}
                  >
                    {u.is_active ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Schedule modal ────────────────────────────────────────────────────────────
function ScheduleModal({ report, onClose, onSaved }: {
  report: ReportAdmin;
  onClose: () => void;
  onSaved: (refresh_schedule: string | null, next_refresh_at: string | null) => void;
}) {
  const qc = useQueryClient();
  const initial: CronState = report.refresh_schedule
    ? parseCron(report.refresh_schedule)
    : { freq: "weekdays", hour: 6, minute: 0, weekdays: [1, 2, 3, 4, 5], monthDay: 1 };

  const [state, setState] = useState<CronState>(initial);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<CronState>) => setState(s => ({ ...s, ...patch }));

  const toggleWeekday = (d: number) =>
    set({ weekdays: state.weekdays.includes(d) ? state.weekdays.filter(x => x !== d) : [...state.weekdays, d] });

  const handleSave = async () => {
    setSaving(true);
    try {
      const cron = buildCron(state);
      const res = await adminApi.reports.updateSchedule(report.id, cron);
      onSaved(res.data.refresh_schedule, res.data.next_refresh_at ?? null);
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      onClose();
    } finally { setSaving(false); }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await adminApi.reports.updateSchedule(report.id, null);
      onSaved(null, null);
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      onClose();
    } finally { setSaving(false); }
  };

  const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const MINUTES = [0, 15, 30, 45];
  const FREQ_OPTIONS: { key: Freq; label: string; desc: string }[] = [
    { key: "daily",    label: "Diário",      desc: "Todos os dias" },
    { key: "weekdays", label: "Dias úteis",  desc: "Segunda a sexta" },
    { key: "weekly",   label: "Semanal",     desc: "Dias da semana escolhidos" },
    { key: "monthly",  label: "Mensal",      desc: "Um dia fixo por mês" },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Agendar atualização</h3>
            <p className="text-xs text-gray-500 mt-0.5">{report.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Frequência */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Frequência</p>
            <div className="grid grid-cols-2 gap-2">
              {FREQ_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => set({ freq: opt.key })}
                  className={clsx(
                    "text-left px-3 py-2.5 rounded-xl border-2 transition-colors",
                    state.freq === opt.key
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <p className={clsx("text-sm font-medium", state.freq === opt.key ? "text-blue-700" : "text-gray-700")}>{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Horário */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Horário</p>
            <div className="flex items-center gap-2">
              <select
                value={state.hour}
                onChange={e => set({ hour: parseInt(e.target.value) })}
                className="input w-24 text-center font-mono"
              >
                {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>)}
              </select>
              <span className="text-gray-400 font-semibold">:</span>
              <select
                value={state.minute}
                onChange={e => set({ minute: parseInt(e.target.value) })}
                className="input w-24 text-center font-mono"
              >
                {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}min</option>)}
              </select>
            </div>
          </div>

          {/* Dias da semana (semanal) */}
          {state.freq === "weekly" && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Dias da semana</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleWeekday(i)}
                    className={clsx(
                      "w-10 h-10 rounded-full text-xs font-semibold transition-colors",
                      state.weekdays.includes(i)
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dia do mês (mensal) */}
          {state.freq === "monthly" && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Dia do mês</p>
              <select
                value={state.monthDay}
                onChange={e => set({ monthDay: parseInt(e.target.value) })}
                className="input w-36"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>Dia {d}{d === 1 ? "º" : "º"}</option>
                ))}
              </select>
            </div>
          )}

          {/* Resumo */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-500 font-semibold uppercase tracking-wider mb-1">Resumo</p>
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
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button
              onClick={handleSave}
              disabled={saving || (state.freq === "weekly" && state.weekdays.length === 0)}
              className="btn-primary text-sm"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Refresh logs panel ────────────────────────────────────────────────────────
function RefreshLogsPanel({ reportId }: { reportId: number }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["refresh-logs", reportId],
    queryFn: () => adminApi.reports.listLogs(reportId).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const [expandedError, setExpandedError] = useState<number | null>(null);

  if (isLoading) return <div className="py-4 text-center text-xs text-gray-400">Carregando logs...</div>;
  if (!logs.length) return <div className="py-4 text-center text-xs text-gray-400">Nenhuma execução registrada ainda.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="py-2 pr-4 text-left font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="py-2 pr-4 text-left font-semibold text-gray-500 uppercase tracking-wide">Início</th>
            <th className="py-2 pr-4 text-left font-semibold text-gray-500 uppercase tracking-wide">Origem</th>
            <th className="py-2 pr-4 text-right font-semibold text-gray-500 uppercase tracking-wide">Linhas</th>
            <th className="py-2 text-right font-semibold text-gray-500 uppercase tracking-wide">Duração</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {logs.map((log: RefreshLog) => (
            <>
              <tr key={log.id} className={clsx("hover:bg-gray-50", log.status === "error" && "bg-red-50 hover:bg-red-50")}>
                <td className="py-2 pr-4">
                  {log.status === "success" ? (
                    <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                      <Check size={10} /> OK
                    </span>
                  ) : (
                    <button
                      className="inline-flex items-center gap-1 text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-medium"
                      onClick={() => setExpandedError(expandedError === log.id ? null : log.id)}
                    >
                      <AlertCircle size={10} /> Erro
                      {expandedError === log.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    </button>
                  )}
                </td>
                <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">
                  {parseUTC(log.started_at)?.toLocaleString("pt-BR")}
                </td>
                <td className="py-2 pr-4 text-gray-500">
                  {log.triggered_by === "scheduler" ? (
                    <span className="inline-flex items-center gap-1"><CalendarClock size={10} /> Agendado</span>
                  ) : (
                    <span className="truncate max-w-[140px] block" title={log.triggered_by}>{log.triggered_by}</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right text-gray-600">
                  {log.row_count != null ? log.row_count.toLocaleString("pt-BR") : "—"}
                </td>
                <td className="py-2 text-right text-gray-500">
                  {log.duration_ms != null ? `${(log.duration_ms / 1000).toFixed(1)}s` : "—"}
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
  );
}

// ── Reports tab ───────────────────────────────────────────────────────────────
function ReportsTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => adminApi.reports.list().then((r) => r.data),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: () => adminApi.groups.list().then((r) => r.data),
  });

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.users.list().then((r) => r.data),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      adminApi.reports.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-reports"] }),
  });

  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [logsOpenId, setLogsOpenId] = useState<number | null>(null);
  const [schedulingReport, setSchedulingReport] = useState<ReportAdmin | null>(null);

  const refreshReport = async (id: number) => {
    setRefreshingId(id);
    try {
      await adminApi.reports.refresh(id);
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: ["refresh-logs", id] });
    } finally {
      setRefreshingId(null);
    }
  };

  const [showForm, setShowForm] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    cover_image_url: "",
    slug: "",
    sql_query: "",
    chart_config: "",
  });

  const createReport = useMutation({
    mutationFn: async () => {
      const payload = { ...form };
      const created = await adminApi.reports.create(payload);

      if (coverFile) {
        const fd = new FormData();
        fd.append("file", coverFile);
        await adminApi.reports.uploadCover(created.data.id, fd);
      }

      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      setShowForm(false);
      setCoverFile(null);
      setForm({ title: "", description: "", cover_image_url: "", slug: "", sql_query: "", chart_config: "" });
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingForm, setEditingForm] = useState({
    title: "",
    description: "",
    cover_image_url: "",
    slug: "",
  });
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

  const { data: permissions = [] } = useQuery({
    queryKey: ["admin-report-permissions", editingId],
    enabled: editingId !== null,
    queryFn: () =>
      editingId === null ? Promise.resolve([]) : adminApi.reports.listPerms(editingId).then((r) => r.data),
  });

  const openEditor = (report: ReportAdmin) => {
    setEditingId(report.id);
    setEditingForm({
      title: report.title,
      description: report.description ?? "",
      cover_image_url: report.cover_image_url ?? "",
      slug: report.slug,
    });
  };

  useEffect(() => {
    if (editingId === null) return;

    const current = reports.find((r) => r.id === editingId);
    if (!current) return;

    setEditingForm({
      title: current.title,
      description: current.description ?? "",
      cover_image_url: current.cover_image_url ?? "",
      slug: current.slug,
    });

    setSelectedUserIds(
      (permissions ?? []).filter((p) => p.user_id !== undefined && p.user_id !== null).map((p) => p.user_id as number)
    );
    setSelectedGroupIds(
      (permissions ?? []).filter((p) => p.group_id !== undefined && p.group_id !== null).map((p) => p.group_id as number)
    );
  }, [editingId, reports, permissions]);

  const saveReportConfig = useMutation({
    mutationFn: async () => {
      if (editingId === null) return;

      await adminApi.reports.update(editingId, {
        title: editingForm.title,
        description: editingForm.description,
        slug: editingForm.slug,
      });

      if (coverFile) {
        const fd = new FormData();
        fd.append("file", coverFile);
        await adminApi.reports.uploadCover(editingId, fd);
      }

      const currentPerms = permissions ?? [];
      const userPermIds = new Set(currentPerms.filter((p) => p.user_id !== undefined && p.user_id !== null).map((p) => p.user_id as number));
      const groupPermIds = new Set(currentPerms.filter((p) => p.group_id !== undefined && p.group_id !== null).map((p) => p.group_id as number));

      for (const perm of currentPerms) {
        if (perm.user_id !== undefined && perm.user_id !== null && !selectedUserIds.includes(perm.user_id)) {
          await adminApi.reports.removePerm(editingId, perm.id);
        }
        if (perm.group_id !== undefined && perm.group_id !== null && !selectedGroupIds.includes(perm.group_id)) {
          await adminApi.reports.removePerm(editingId, perm.id);
        }
      }

      for (const userId of selectedUserIds) {
        if (!userPermIds.has(userId)) {
          await adminApi.reports.addPerm(editingId, { user_id: userId });
        }
      }

      for (const groupId of selectedGroupIds) {
        if (!groupPermIds.has(groupId)) {
          await adminApi.reports.addPerm(editingId, { group_id: groupId });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-report-permissions"] });
      setCoverFile(null);
      setEditingId(null);
    },
  });

  if (isLoading) return <Spinner />;

  const handleScheduleSaved = (refresh_schedule: string | null, next_refresh_at: string | null) => {
    qc.setQueryData<ReportAdmin[]>(["admin-reports"], (prev = []) =>
      prev.map(r => r.id === schedulingReport?.id ? { ...r, refresh_schedule: refresh_schedule ?? undefined, next_refresh_at: next_refresh_at ?? undefined } : r)
    );
  };

  const nextStatus: Record<string, string | null> = {
    draft: "in_review",
    in_review: "published",
    published: "archived",
    archived: "in_review",
  };

  const nextLabel: Record<string, string> = {
    draft: "Enviar para revisão",
    in_review: "Publicar",
    published: "Arquivar",
    archived: "Restaurar",
  };

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
        <h2 className="text-lg font-semibold text-gray-800">Relatórios</h2>
        <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={15} /> Novo relatório
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="input" placeholder="Título" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <input className="input" placeholder="Slug (ex: fluxo-medicao)" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
          </div>
          <input className="input" placeholder="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Imagem de capa</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gov-blue file:px-3 file:py-2 file:text-white"
            />
          </div>
          <textarea className="input font-mono text-xs" rows={8} placeholder="SQL Query" value={form.sql_query} onChange={e => setForm(f => ({ ...f, sql_query: e.target.value }))} />
          <div className="flex gap-2">
            <button className="btn-primary text-sm" onClick={() => createReport.mutate()}>Salvar</button>
            <button className="btn-secondary text-sm" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {editingId !== null && (
        <div className="card p-5 mb-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-800">Configuração do relatório</h3>
              <p className="text-xs text-gray-500">Ajuste a capa, a descrição e os acessos</p>
            </div>
            <button className="btn-secondary text-xs" onClick={() => setEditingId(null)}>Fechar</button>
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
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Imagem de capa</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gov-blue file:px-3 file:py-2 file:text-white"
                />
                {editingForm.cover_image_url && !coverFile && (
                  <img src={resolveImageUrl(editingForm.cover_image_url, true)} alt="Capa atual" className="mt-3 h-28 w-full rounded-lg object-cover border border-gray-200" />
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
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Perfis com acesso</p>
                <div className="space-y-2 max-h-40 overflow-auto pr-1">
                  {groups.map((group) => (
                    <label key={group.id} className="flex items-center gap-2 text-sm text-gray-700">
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
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Usuários com acesso</p>
                <div className="space-y-2 max-h-40 overflow-auto pr-1">
                  {users.map((user) => (
                    <label key={user.id} className="flex items-center gap-2 text-sm text-gray-700">
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
                      {user.full_name} <span className="text-gray-400">({user.email})</span>
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
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Título", "Status", "Última atualização", "Próximo refresh", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.map((r: ReportAdmin) => (
              <React.Fragment key={r.id}>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/relatorio/${r.slug}`)}>
                  <p className="font-medium text-gray-800 hover:text-gov-blue transition-colors">{r.title}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{r.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge-${r.status}`}>{STATUS_LABELS[r.status]}</span>
                </td>
                <td className="px-4 py-3">
                  {r.last_refreshed_at ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock size={12} className="text-green-500" />
                      <span>{parseUTC(r.last_refreshed_at)?.toLocaleString("pt-BR")}</span>
                      {r.row_count != null && (
                        <span className="text-gray-400">({r.row_count.toLocaleString("pt-BR")} linhas)</span>
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
                      <span>{new Date(r.next_refresh_at!).toLocaleString("pt-BR")}</span>
                    </div>
                  ) : r.refresh_schedule ? (
                    <span className="text-xs text-gray-400 font-mono">{r.refresh_schedule}</span>
                  ) : (
                    <span className="text-xs text-gray-300">Manual</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      className="text-xs text-gov-blue hover:text-gov-blue-dark transition-colors"
                      onClick={() => openEditor(r)}
                    >
                      Configurar
                    </button>

                    <button
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors border-l pl-3"
                      onClick={() => setSchedulingReport(r)}
                      title={r.refresh_schedule ? `Agendado: ${r.refresh_schedule}` : "Sem agendamento"}
                    >
                      <CalendarClock size={13} className={r.refresh_schedule ? "text-blue-400" : "text-gray-300"} />
                      Agendar
                    </button>

                    <button
                      className={clsx(
                        "flex items-center gap-1 text-xs font-medium transition-colors",
                        refreshingId === r.id
                          ? "text-gray-400 cursor-wait"
                          : "text-gov-blue hover:text-gov-blue-dark"
                      )}
                      onClick={() => refreshReport(r.id)}
                      disabled={refreshingId === r.id}
                      title="Buscar dados do DW agora"
                    >
                      <RefreshCw size={13} className={refreshingId === r.id ? "animate-spin" : ""} />
                      {refreshingId === r.id ? "Importando..." : "Atualizar dados"}
                    </button>

                    <button
                      className={clsx(
                        "flex items-center gap-1 text-xs transition-colors border-l pl-3",
                        logsOpenId === r.id ? "text-gray-700 font-medium" : "text-gray-400 hover:text-gray-600"
                      )}
                      onClick={() => setLogsOpenId(logsOpenId === r.id ? null : r.id)}
                    >
                      {logsOpenId === r.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      Logs
                    </button>

                    {nextStatus[r.status] && (
                      <button
                        className="text-xs text-gray-500 hover:text-gray-800 transition-colors border-l pl-3"
                        onClick={() => setStatus.mutate({ id: r.id, status: nextStatus[r.status]! })}
                      >
                        {nextLabel[r.status]}
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
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-7 h-7 border-2 border-gov-blue border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Main Admin ────────────────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState<Tab>("reports");

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "reports", label: "Relatórios", icon: <FileBarChart size={16} /> },
    { key: "users", label: "Usuários", icon: <Users size={16} /> },
    { key: "groups", label: "Grupos", icon: <Layers size={16} /> },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Administração</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie usuários, grupos e relatórios do portal</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.key
                ? "border-gov-blue text-gov-blue"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "groups" && (
        <div className="card p-8 text-center text-gray-400">Gerenciamento de grupos em breve.</div>
      )}
      {tab === "reports" && <ReportsTab />}
    </div>
  );
}
