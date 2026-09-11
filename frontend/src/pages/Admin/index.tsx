import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, ReportAdmin, UserAdmin } from "../../services/api";
import { Plus, Users, FileBarChart, Layers, Check, X, Pencil } from "lucide-react";
import clsx from "clsx";

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
                  <span className={clsx("badge", u.role === "admin" ? "badge-published" : u.role === "publisher" ? "badge-in_review" : "badge-draft")}>
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

// ── Reports tab ───────────────────────────────────────────────────────────────
function ReportsTab() {
  const qc = useQueryClient();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => adminApi.reports.list().then((r) => r.data),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      adminApi.reports.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-reports"] }),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", slug: "", sql_query: "", chart_config: "" });

  const createReport = useMutation({
    mutationFn: () => adminApi.reports.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      setShowForm(false);
    },
  });

  if (isLoading) return <Spinner />;

  const nextStatus: Record<string, string | null> = {
    draft: "in_review",
    in_review: "published",
    published: "archived",
    archived: null,
  };

  const nextLabel: Record<string, string> = {
    draft: "Enviar para revisão",
    in_review: "Publicar",
    published: "Arquivar",
  };

  return (
    <div>
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
          <textarea className="input font-mono text-xs" rows={8} placeholder="SQL Query" value={form.sql_query} onChange={e => setForm(f => ({ ...f, sql_query: e.target.value }))} />
          <div className="flex gap-2">
            <button className="btn-primary text-sm" onClick={() => createReport.mutate()}>Salvar</button>
            <button className="btn-secondary text-sm" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Título", "Slug", "Status", "Criado em", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.map((r: ReportAdmin) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{r.title}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.slug}</td>
                <td className="px-4 py-3">
                  <span className={`badge-${r.status}`}>{STATUS_LABELS[r.status]}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-right">
                  {nextStatus[r.status] && (
                    <button
                      className="text-xs text-gov-blue hover:underline"
                      onClick={() => setStatus.mutate({ id: r.id, status: nextStatus[r.status]! })}
                    >
                      {nextLabel[r.status]}
                    </button>
                  )}
                </td>
              </tr>
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
