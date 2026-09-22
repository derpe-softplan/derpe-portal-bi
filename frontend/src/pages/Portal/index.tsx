import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart3, ChevronDown, ChevronUp, Clock, AlertCircle, Download, FileSpreadsheet } from 'lucide-react'
import clsx from 'clsx'
import { portalApi, parseUTC, ReportCard, resolveImageUrl } from '../../services/api'
import { resolveThumbnailBySlug } from '../../panels/registry'
import { useAuth } from '../../context/AuthContext'

const SISTEMAS = ['SMO', 'CQM', 'SGF', 'SCO']
const TIPOS = ['Obras', 'Financeiro', 'Orçamento', 'Gerencial']

function ReportCardItem({ report }: { report: ReportCard }) {
  const navigate = useNavigate()
  const Thumbnail = resolveThumbnailBySlug(report.panel_slug ?? report.slug)
  const hasData = !!report.last_refreshed_at

  return (
    <div
      className="card p-0 overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
      onClick={() => navigate(`/relatorio/${report.slug}`)}
    >
      {/* Thumbnail */}
      <div className="relative h-36 bg-gray-100 dark:bg-gray-700 overflow-hidden border-b border-gray-100 dark:border-gray-600">
        {report.cover_image_url ? (
          <img
            src={resolveImageUrl(report.cover_image_url, true)}
            alt={report.title}
            className="w-full h-full object-cover"
          />
        ) : Thumbnail ? (
          <Thumbnail />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BarChart3 size={36} className="text-gray-200 dark:text-gray-600" />
          </div>
        )}
        {!hasData && (
          <div className="absolute inset-0 bg-white/70 dark:bg-gray-800/70 flex items-center justify-center">
            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
              Aguardando dados
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-gov-blue dark:group-hover:text-blue-400 transition-colors leading-snug">
          {report.title}
        </h3>

        {report.description && (
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">{report.description}</p>
        )}

        <div className="flex items-center gap-1.5 text-xs">
          {hasData ? (
            <>
              <Clock size={11} className="text-green-500 flex-shrink-0" />
              <span className="text-gray-400">
                Atualizado em {parseUTC(report.last_refreshed_at)?.toLocaleDateString('pt-BR')}
              </span>
            </>
          ) : (
            <>
              <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
              <span className="text-amber-600">Aguardando importação</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
        active
          ? 'bg-gov-blue text-white border-gov-blue'
          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gov-blue hover:text-gov-blue'
      )}
    >
      {label}
    </button>
  )
}

function paginationPages(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | null)[] = [1]
  if (current > 3) pages.push(null)
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push(null)
  pages.push(total)
  return pages
}

function ExtractionCard({ report }: { report: ReportCard }) {
  const [expanded, setExpanded] = useState(false)
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [downloading, setDownloading] = useState(false)
  const [downloadingFiltered, setDownloadingFiltered] = useState(false)
  const PAGE_SIZE = 25
  const hasData = !!report.last_refreshed_at

  const { data, isLoading } = useQuery({
    queryKey: ['extraction-data', report.slug],
    queryFn: () => portalApi.getReportData(report.slug).then((r) => r.data),
    enabled: expanded && hasData,
    staleTime: 5 * 60 * 1000,
  })

  const columns = useMemo(() => (data && data.length > 0 ? Object.keys(data[0]) : []), [data])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.filter((row) =>
      columns.every((col) => {
        const f = (colFilters[col] ?? '').trim().toLowerCase()
        return !f || String(row[col] ?? '').toLowerCase().includes(f)
      })
    )
  }, [data, colFilters, columns])

  const hasActiveFilters = Object.values(colFilters).some((v) => v.trim() !== '')

  useEffect(() => { setPage(1) }, [colFilters])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const setFilter = (col: string, val: string) =>
    setColFilters((prev) => ({ ...prev, [col]: val }))

  const clearFilters = () => setColFilters({})

  const handleDownloadAll = async () => {
    setDownloading(true)
    try {
      await portalApi.downloadReport(report.slug, report.title)
    } finally {
      setDownloading(false)
    }
  }

  const handleDownloadFiltered = async () => {
    setDownloadingFiltered(true)
    try {
      await portalApi.downloadFiltered(report.slug, report.title, filtered)
    } finally {
      setDownloadingFiltered(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="p-5 flex items-start gap-4">
        <div className="w-11 h-11 bg-green-50 dark:bg-green-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
          <FileSpreadsheet size={22} className="text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-0.5">{report.title}</h3>
          {report.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{report.description}</p>
          )}
          <div className="flex items-center gap-1.5 text-xs">
            {hasData ? (
              <>
                <Clock size={11} className="text-green-500 flex-shrink-0" />
                <span className="text-gray-400">
                  Atualizado em {parseUTC(report.last_refreshed_at)?.toLocaleDateString('pt-BR')}
                </span>
                {(report.row_count ?? 0) > 0 && (
                  <span className="text-gray-400">
                    · {report.row_count!.toLocaleString('pt-BR')} registros
                  </span>
                )}
              </>
            ) : (
              <>
                <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
                <span className="text-amber-600">Aguardando importação</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDownloadAll}
            disabled={!hasData || downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gov-blue text-white hover:bg-gov-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Baixar Excel
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            disabled={!hasData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gov-blue hover:text-gov-blue dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {expanded ? 'Fechar' : 'Ver dados'}
          </button>
        </div>
      </div>

      {/* ── Preview expandido ───────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {/* Toolbar */}
          <div className="px-5 py-2.5 flex items-center gap-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {filtered.length.toLocaleString('pt-BR')} registro{filtered.length !== 1 ? 's' : ''}
              {hasActiveFilters && ` de ${(data?.length ?? 0).toLocaleString('pt-BR')}`}
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-gov-blue hover:underline whitespace-nowrap"
              >
                Limpar filtros
              </button>
            )}
            <button
              onClick={handleDownloadFiltered}
              disabled={downloadingFiltered || filtered.length === 0}
              className="ml-auto flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg border border-gov-blue text-gov-blue hover:bg-gov-blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {downloadingFiltered ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {hasActiveFilters ? 'Baixar filtrado' : 'Baixar Excel'}
            </button>
          </div>

          {/* Tabela */}
          {isLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-gray-400">
              <div className="w-5 h-5 border-2 border-gov-blue border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Carregando dados...</span>
            </div>
          ) : data && data.length > 0 ? (
            <>
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900/60 sticky top-0 z-10">
                    <tr>
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 pt-2.5 pb-0 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      {columns.map((col) => (
                        <th key={col} className="px-2 py-1.5">
                          <input
                            type="text"
                            value={colFilters[col] ?? ''}
                            onChange={(e) => setFilter(col, e.target.value)}
                            placeholder="Filtrar…"
                            className="w-full min-w-[80px] px-2 py-1 text-xs font-normal border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gov-blue/40 focus:border-gov-blue"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {pageData.length > 0 ? pageData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        {columns.map((col) => (
                          <td
                            key={col}
                            className="px-3 py-2 text-gray-800 dark:text-gray-200 whitespace-nowrap"
                          >
                            {row[col] === null || row[col] === undefined ? '' : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={columns.length} className="py-10 text-center text-gray-400">
                          Nenhum resultado para os filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-5 py-2.5 flex items-center justify-center gap-1 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    ←
                  </button>
                  {paginationPages(page, totalPages).map((p, i) =>
                    p === null ? (
                      <span key={`e${i}`} className="px-1 text-xs text-gray-400">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={clsx(
                          'w-7 h-7 rounded text-xs',
                          p === page
                            ? 'bg-gov-blue text-white'
                            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                        )}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="py-10 text-center text-sm text-gray-400">Sem dados para exibir.</div>
          )}
        </div>
      )}
    </div>
  )
}

type Section = 'paineis' | 'extracoes'

export default function Portal() {
  const { user } = useAuth()
  const [section, setSection] = useState<Section>('paineis')
  const [filterSistemas, setFilterSistemas] = useState<string[]>([])
  const [filterTipos, setFilterTipos] = useState<string[]>([])

  const {
    data: reports,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['portal-reports'],
    queryFn: () => portalApi.listReports().then((r) => r.data),
    staleTime: 0,
  })

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value])

  const extractions = (reports ?? []).filter((r) => r.tipos?.includes('Extração'))
  const panels = (reports ?? []).filter((r) => !r.tipos?.includes('Extração'))

  const filtered = panels.filter((r) => {
    const passSistema =
      filterSistemas.length === 0 || filterSistemas.some((s) => r.sistemas?.includes(s))
    const passTipo =
      filterTipos.length === 0 || filterTipos.some((t) => r.tipos?.includes(t))
    return passSistema && passTipo
  })

  const hasFilters = filterSistemas.length > 0 || filterTipos.length > 0


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gov-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-8 text-center text-red-600">
        Erro ao carregar relatórios. Tente novamente.
      </div>
    )
  }

  return (
    <div>
      {/* ── Cabeçalho ────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <p className="text-sm text-gov-blue dark:text-blue-400 font-medium mb-0.5">
          Olá, {user?.full_name?.split(' ')[0]}!
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {section === 'paineis' ? 'Painéis disponíveis' : 'Extrações'}
        </h1>
        {section === 'paineis' && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {panels.length} painel(is) publicado(s) para o seu perfil
          </p>
        )}
        {section === 'extracoes' && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Exportações de dados disponíveis para download
          </p>
        )}
      </div>

      {/* ── Tabs de seção ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-gray-700">
        {([
          { id: 'paineis', label: 'Painéis', icon: <BarChart3 size={14} /> },
          { id: 'extracoes', label: 'Extrações', icon: <Download size={14} /> },
        ] as { id: Section; label: string; icon: React.ReactNode }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              section === tab.id
                ? 'border-gov-blue text-gov-blue dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Painéis ──────────────────────────────────────────────────────────── */}
      {section === 'paineis' && (
        <>
          {reports && reports.length > 0 && (
            <div className="card px-4 py-3 mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  Sistema
                </span>
                {SISTEMAS.map((s) => (
                  <FilterChip
                    key={s}
                    label={s}
                    active={filterSistemas.includes(s)}
                    onClick={() => toggle(filterSistemas, setFilterSistemas, s)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  Tipo
                </span>
                {TIPOS.map((t) => (
                  <FilterChip
                    key={t}
                    label={t}
                    active={filterTipos.includes(t)}
                    onClick={() => toggle(filterTipos, setFilterTipos, t)}
                  />
                ))}
              </div>
              {hasFilters && (
                <button
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => { setFilterSistemas([]); setFilterTipos([]) }}
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((r) => (
                <ReportCardItem key={r.id} report={r} />
              ))}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <BarChart3 size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">
                {hasFilters
                  ? 'Nenhum painel corresponde aos filtros selecionados.'
                  : 'Nenhum painel disponível para o seu perfil.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Extrações ────────────────────────────────────────────────────────── */}
      {section === 'extracoes' && (
        <>
          {extractions.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Download size={26} className="text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Nenhuma extração disponível
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
                Em breve serão disponibilizadas exportações de dados para download direto nesta seção.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {extractions.map((r) => (
                <ExtractionCard key={r.id} report={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
