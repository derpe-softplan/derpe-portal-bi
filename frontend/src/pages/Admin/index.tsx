import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { adminApi, resolveImageUrl, ReportAdmin, UserAdmin } from "../../services/api";
import {
  Plus, Users, FileBarChart, Layers,
  Check, X, RefreshCw, Clock,
} from "lucide-react";
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

  const refreshReport = async (id: number) => {
    setRefreshingId(id);
    try {
      await adminApi.reports.refresh(id);
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
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
              {["Título", "Status", "Dados importados", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.map((r: ReportAdmin) => (
              <tr key={r.id} className="hover:bg-gray-50">
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
                      <span>{new Date(r.last_refreshed_at).toLocaleString("pt-BR")}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      Sem dados — clique em Atualizar
                    </span>
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
