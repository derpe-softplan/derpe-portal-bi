import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: UserMe }>("/auth/login", { email, password }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get<UserMe>("/auth/me"),
};

// ── Portal ────────────────────────────────────────────────────────────────────
export const portalApi = {
  listReports: () => api.get<ReportCard[]>("/portal/reports"),
  getReport: (slug: string) => api.get<ReportCard>(`/portal/reports/${slug}`),
  getReportData: (slug: string) => api.get<Record<string, unknown>[]>(`/portal/reports/${slug}/data`),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  users: {
    list: () => api.get<UserAdmin[]>("/admin/users"),
    create: (d: UserCreate) => api.post<UserAdmin>("/admin/users", d),
    update: (id: number, d: Partial<UserCreate>) => api.put<UserAdmin>(`/admin/users/${id}`, d),
  },
  groups: {
    list: () => api.get<Group[]>("/admin/groups"),
    create: (d: { name: string; description?: string }) => api.post<Group>("/admin/groups", d),
    addMember: (gid: number, uid: number) => api.post(`/admin/groups/${gid}/members/${uid}`),
    removeMember: (gid: number, uid: number) => api.delete(`/admin/groups/${gid}/members/${uid}`),
  },
  reports: {
    list: () => api.get<ReportAdmin[]>("/admin/reports"),
    create: (d: ReportCreate) => api.post<ReportAdmin>("/admin/reports", d),
    update: (id: number, d: Partial<ReportCreate>) => api.put<ReportAdmin>(`/admin/reports/${id}`, d),
    setStatus: (id: number, status: string) =>
      api.patch<ReportAdmin>(`/admin/reports/${id}/status`, { status }),
    listPerms: (id: number) => api.get<Permission[]>(`/admin/reports/${id}/permissions`),
    addPerm: (id: number, d: { user_id?: number; group_id?: number }) =>
      api.post<Permission>(`/admin/reports/${id}/permissions`, d),
    removePerm: (id: number, pid: number) => api.delete(`/admin/reports/${id}/permissions/${pid}`),
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface UserMe {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "publisher" | "viewer";
}

export interface UserAdmin extends UserMe {
  is_active: boolean;
  created_at: string;
}

export interface UserCreate {
  email: string;
  full_name: string;
  password: string;
  role: string;
}

export interface Group {
  id: number;
  name: string;
  description?: string;
}

export interface ReportCard {
  id: number;
  title: string;
  description?: string;
  slug: string;
  published_at?: string;
}

export interface ReportAdmin extends ReportCard {
  status: "draft" | "in_review" | "published" | "archived";
  created_at: string;
  updated_at: string;
}

export interface ReportCreate {
  title: string;
  description?: string;
  slug: string;
  sql_query: string;
  chart_config?: string;
}

export interface Permission {
  id: number;
  user_id?: number;
  group_id?: number;
}
