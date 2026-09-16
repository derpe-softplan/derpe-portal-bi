import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

/** Backend retorna datetimes UTC sem sufixo Z — adiciona para o browser parsear corretamente. */
export function parseUTC(s?: string | null): Date | null {
  if (!s) return null
  return new Date(/Z|[+-]\d{2}:/.test(s) ? s : s + 'Z')
}

export function resolveImageUrl(url?: string | null, cacheBust = false): string | undefined {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url))
    return cacheBust ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : url

  const safePath = url.startsWith('/') ? url : `/${url.replace(/^\.?\//, '')}`
  return `${window.location.origin}${safePath}${cacheBust ? `?t=${Date.now()}` : ''}`
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: UserMe }>('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<UserMe>('/auth/me'),
}

// ── Portal ────────────────────────────────────────────────────────────────────
export const portalApi = {
  listReports: () => api.get<ReportCard[]>('/portal/reports'),
  getReport: (slug: string) => api.get<ReportCard>(`/portal/reports/${slug}`),
  getReportData: (slug: string) =>
    api.get<Record<string, unknown>[]>(`/portal/reports/${slug}/data`),
}

// ── Cronograma ────────────────────────────────────────────────────────────────
export const cronogramaApi = {
  getAll: () => api.get<Record<string, Record<string, string>>>('/portal/cronograma'),
  save: (key: string, days: Record<string, string>) => api.put(`/admin/cronograma/${key}`, days),
  delete: (key: string) => api.delete(`/admin/cronograma/${key}`),
}

// ── Medição ───────────────────────────────────────────────────────────────────
export const medicaoApi = {
  getAssinaturas: (skmedicao: string) =>
    api.get<MedicaoAssinatura[]>(`/portal/medicoes/${skmedicao}/assinaturas`),
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  users: {
    list: () => api.get<UserAdmin[]>('/admin/users'),
    create: (d: UserCreate) => api.post<UserAdmin>('/admin/users', d),
    update: (id: number, d: UserUpdate) => api.put<UserAdmin>(`/admin/users/${id}`, d),
  },
  groups: {
    list: () => api.get<Group[]>('/admin/groups'),
    create: (d: { name: string; description?: string }) => api.post<Group>('/admin/groups', d),
    addMember: (gid: number, uid: number) => api.post(`/admin/groups/${gid}/members/${uid}`),
    removeMember: (gid: number, uid: number) => api.delete(`/admin/groups/${gid}/members/${uid}`),
  },
  reports: {
    list: () => api.get<ReportAdmin[]>('/admin/reports'),
    create: (d: ReportCreate) => api.post<ReportAdmin>('/admin/reports', d),
    update: (id: number, d: Partial<ReportCreate>) =>
      api.put<ReportAdmin>(`/admin/reports/${id}`, d),
    uploadCover: (id: number, formData: FormData) =>
      api.post<ReportAdmin>(`/admin/reports/${id}/cover`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    setStatus: (id: number, status: string) =>
      api.patch<ReportAdmin>(`/admin/reports/${id}/status`, { status }),
    refresh: (id: number) =>
      api.post<{ refreshed_at: string; row_count: number }>(`/admin/reports/${id}/refresh`),
    getData: (id: number) => api.get<Record<string, unknown>[]>(`/admin/reports/${id}/data`),
    listLogs: (id: number, limit = 30) =>
      api.get<RefreshLog[]>(`/admin/reports/${id}/refresh-logs?limit=${limit}`),
    updateSchedule: (id: number, cron: string | null) =>
      api.patch<{ refresh_schedule: string | null; next_refresh_at: string | null }>(
        `/admin/reports/${id}/schedule`,
        { cron }
      ),
    listPerms: (id: number) => api.get<Permission[]>(`/admin/reports/${id}/permissions`),
    addPerm: (id: number, d: { user_id?: number; group_id?: number }) =>
      api.post<Permission>(`/admin/reports/${id}/permissions`, d),
    removePerm: (id: number, pid: number) => api.delete(`/admin/reports/${id}/permissions/${pid}`),
  },
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface UserMe {
  id: number
  email: string
  full_name: string
  role: 'admin' | 'publisher' | 'viewer'
}

export interface UserAdmin extends UserMe {
  is_active: boolean
  created_at: string
}

export interface UserCreate {
  email: string
  full_name: string
  password: string
  role: string
}

export interface UserUpdate {
  full_name?: string
  role?: string
  is_active?: boolean
  password?: string
}

export interface Group {
  id: number
  name: string
  description?: string
}

export interface ReportCard {
  id: number
  title: string
  description?: string
  cover_image_url?: string
  slug: string
  panel_slug?: string
  published_at?: string
  last_refreshed_at?: string
  row_count?: number
}

export interface ReportAdmin extends ReportCard {
  status: 'draft' | 'in_review' | 'published' | 'archived'
  refresh_schedule?: string
  next_refresh_at?: string
  created_at: string
  updated_at: string
}

export interface RefreshLog {
  id: number
  triggered_by: string
  status: 'success' | 'error'
  row_count?: number
  duration_ms?: number
  error_message?: string
  started_at: string
}

export interface ReportCreate {
  title: string
  description?: string
  cover_image_url?: string
  slug: string
  sql_query: string
  chart_config?: string
}

export interface MedicaoAssinatura {
  nutitulo: number | null
  cdtitulo: string | null
  skmedicao: number | null
  nuseqmedicaoh: number | null
  nmpapel: string | null
  nmsituacao: string | null
  nmfiscal: string | null
}

export interface Permission {
  id: number
  user_id?: number
  group_id?: number
}
