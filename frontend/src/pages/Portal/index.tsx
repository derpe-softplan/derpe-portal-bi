import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Clock, AlertCircle } from 'lucide-react'
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

export default function Portal() {
  const { user } = useAuth()
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

  const filtered = (reports ?? []).filter((r) => {
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
      <div className="mb-5">
        <p className="text-sm text-gov-blue dark:text-blue-400 font-medium mb-0.5">
          Olá, {user?.full_name?.split(' ')[0]}!
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Relatórios disponíveis</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {filtered.length} relatório(s) publicado(s) para o seu perfil
        </p>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
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
              ? 'Nenhum relatório corresponde aos filtros selecionados.'
              : 'Nenhum relatório disponível para o seu perfil.'}
          </p>
        </div>
      )}
    </div>
  )
}
