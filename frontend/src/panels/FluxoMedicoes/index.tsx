import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react'
import {
  ArrowRight, AlertTriangle, Banknote, ChevronUp, ChevronDown,
  ChevronsUpDown, Search, X, FileText, Landmark, TrendingDown,
  CircleAlert, Building2, BarChart3, HelpCircle,
} from 'lucide-react'
import { KpiCard } from '../../components/KpiCard'
import { ComboBox } from '../../components/ComboBox'
import { MonthPicker } from '../../components/MonthPicker'
import { EChart } from '../../components/EChart'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface FluxoRow {
  id: string
  contrato: string
  num_medicao: number
  empresa: string
  rodovias: string
  natureza: string
  tipo_contrato: string | null
  diretoria: string
  distrito: string
  vlevento: number
  valor_pago: number
  valor_liquidado: number
  qtd_notas: number
  etapa_jornada: string
  status_pgto: string
  mes_ano: string
  dt_aprovacao: string | null
  dt_envio_sei: string | null
  dt_ultima_liq: string | null
  dt_ultimo_pgto: string | null
  dt_medicao: string | null
  qt_faltam: number
  dias_na_etapa: number
}

// ── Mapeamento snapshot → FluxoRow ────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

function computeDias(row: FluxoRow): number {
  switch (row.etapa_jornada) {
    case 'Finalizada - aguardando nota': return daysSince(row.dt_aprovacao)
    case 'Nota emitida':                 return daysSince(row.dt_envio_sei || row.dt_aprovacao)
    case 'Liquidada':                    return daysSince(row.dt_ultima_liq)
    case 'Paga parcialmente':            return daysSince(row.dt_ultimo_pgto)
    case 'Assinatura pendente':          return daysSince(row.dt_aprovacao)
    default:                             return daysSince(row.dt_medicao)
  }
}

export function mapSnapshot(raw: Record<string, unknown>[]): FluxoRow[] {
  return raw.map(r => {
    const empresaRaw = String(r['Empresa'] ?? '')
    const row: FluxoRow = {
      id:              String(r['MedicaoId'] ?? ''),
      contrato:        String(r['Contrato'] ?? ''),
      num_medicao:     Number(r['Medição'] ?? 0),
      empresa:         empresaRaw.split(';')[0].trim(),
      rodovias:        String(r['Rodovias'] ?? ''),
      natureza:        String(r['Natureza'] ?? ''),
      tipo_contrato:   r['Tipo de contrato'] ? String(r['Tipo de contrato']) : null,
      diretoria:       String(r['Diretoria'] ?? ''),
      distrito:        String(r['Distrito/Setor'] ?? ''),
      vlevento:        Number(r['Valor Medido Reajustado'] ?? 0),
      valor_pago:      Number(r['Valor Pago'] ?? 0),
      valor_liquidado: Number(r['Valor Liquidado'] ?? 0),
      qtd_notas:       Number(r['Qtd Notas'] ?? 0),
      etapa_jornada:   String(r['Etapa Atual da Jornada'] ?? ''),
      status_pgto:     String(r['Status Pagamento'] ?? ''),
      mes_ano:         String(r['Mês/Ano'] ?? ''),
      dt_aprovacao:    r['Data da aprovação'] ? String(r['Data da aprovação']) : null,
      dt_envio_sei:    r['Data do SEI'] ? String(r['Data do SEI']) : null,
      dt_ultima_liq:   r['Data Última Liquidação'] ? String(r['Data Última Liquidação']) : null,
      dt_ultimo_pgto:  r['Data Último Pagamento'] ? String(r['Data Último Pagamento']) : null,
      dt_medicao:      r['Data da medição'] ? String(r['Data da medição']) : null,
      qt_faltam:       Number(r['QT_FALTAM'] ?? 0),
      dias_na_etapa:   0,
    }
    row.dias_na_etapa = computeDias(row)
    return row
  })
}

// ── Constantes de etapas ──────────────────────────────────────────────────────

const ETAPA_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
  'Criada':                       { bg: '#F9FAFB', color: '#6B7280', border: '#D1D5DB' },
  'Iniciada':                     { bg: '#E0F2FE', color: '#0369A1', border: '#7DD3FC' },
  'Assinatura pendente':          { bg: '#FEF3C7', color: '#B45309', border: '#FCD34D' },
  'Finalizada - aguardando nota': { bg: '#FFF7ED', color: '#C2410C', border: '#FDBA74' },
  'Nota emitida':                 { bg: '#F5F3FF', color: '#6D28D9', border: '#C4B5FD' },
  'Liquidada':                    { bg: '#ECFEFF', color: '#0E7490', border: '#67E8F9' },
  'Paga parcialmente':            { bg: '#F7FEE7', color: '#4D7C0F', border: '#BEF264' },
  'Paga integralmente':           { bg: '#F0FDF4', color: '#166534', border: '#86EFAC' },
}

const ETAPA_COLORS: Record<string, string> = {
  'Criada':                       '#9CA3AF',
  'Iniciada':                     '#0EA5E9',
  'Assinatura pendente':          '#F59E0B',
  'Finalizada - aguardando nota': '#F97316',
  'Nota emitida':                 '#8B5CF6',
  'Liquidada':                    '#06B6D4',
  'Paga parcialmente':            '#84CC16',
  'Paga integralmente':           '#16A34A',
}

const ETAPAS_ORDER = [
  'Criada', 'Iniciada', 'Assinatura pendente',
  'Finalizada - aguardando nota', 'Nota emitida',
  'Liquidada', 'Paga parcialmente', 'Paga integralmente',
]

const FUNIL_LABELS: Record<string, string> = {
  'Criada':                       'Criada',
  'Iniciada':                     'Iniciada',
  'Assinatura pendente':          'Assin. Pendente',
  'Finalizada - aguardando nota': 'Ag. Nota',
  'Nota emitida':                 'Nota Emitida',
  'Liquidada':                    'Liquidada',
  'Paga parcialmente':            'Paga Parc.',
  'Paga integralmente':           'Paga Integr.',
}

const ETAPAS_CRITICAS = new Set([
  'Finalizada - aguardando nota', 'Nota emitida', 'Liquidada', 'Paga parcialmente',
])

// ── Formatadores ──────────────────────────────────────────────────────────────

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v)

const brlFull = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtNum = (v: number) => v.toLocaleString('pt-BR')

// ── Badges ────────────────────────────────────────────────────────────────────

function etapaBadge(etapa: string) {
  const cfg = ETAPA_CONFIG[etapa] ?? { bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' }
  return (
    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {etapa}
    </span>
  )
}

function diasBadge(etapa: string, dias: number) {
  if (etapa === 'Paga integralmente') return <span className="text-xs font-semibold text-emerald-600">Concluída</span>
  if (!ETAPAS_CRITICAS.has(etapa)) return <span className="text-xs text-gray-400">{dias}d</span>
  const cls = dias >= 30 ? 'bg-red-100 text-red-700 font-bold' : dias >= 15 ? 'bg-amber-100 text-amber-700 font-semibold' : 'bg-gray-100 text-gray-500'
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{dias}d</span>
}

// ── Funil ─────────────────────────────────────────────────────────────────────

function FunilCompleto({ data, activeEtapa, onEtapaClick }: {
  data: FluxoRow[]
  activeEtapa: string | null
  onEtapaClick: (etapa: string | null) => void
}) {
  const funil = useMemo(() => {
    const total = data.length || 1
    return ETAPAS_ORDER.map((etapa, i) => {
      const rows = data.filter(r => r.etapa_jornada === etapa)
      return { etapa, ordem: i, quantidade: rows.length, valor: rows.reduce((s, r) => s + r.vlevento, 0), percentual: Math.round(rows.length / total * 100) }
    }).filter(e => e.quantidade > 0)
  }, [data])

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-1 pt-0.5">
      {funil.map((item, i) => {
        const color = ETAPA_COLORS[item.etapa] ?? '#9CA3AF'
        const isActive = activeEtapa === item.etapa
        const isCritical = ETAPAS_CRITICAS.has(item.etapa)
        return (
          <div key={item.etapa} className="flex items-center gap-1 flex-1 min-w-[110px]">
            <button
              onClick={() => onEtapaClick(isActive ? null : item.etapa)}
              className="flex-1 rounded-xl p-3 text-left transition-all hover:shadow-md hover:-translate-y-0.5 border-2"
              style={{ borderColor: isActive ? color : color + '40', backgroundColor: isActive ? color + '18' : color + '08', boxShadow: isActive ? `0 0 0 2px ${color}40` : undefined }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: color + '20', color }}>{item.percentual}%</span>
                {isCritical && item.quantidade > 0 && <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />}
              </div>
              <div className="text-xl font-bold text-gray-900 leading-none">{fmtNum(item.quantidade)}</div>
              <div className="text-xs font-semibold mt-1 leading-tight" style={{ color }}>{FUNIL_LABELS[item.etapa] ?? item.etapa}</div>
              <div className="text-xs text-gray-400 mt-0.5">{brl(item.valor)}</div>
            </button>
            {i < funil.length - 1 && <ArrowRight size={12} className="flex-shrink-0 text-gray-200" />}
          </div>
        )
      })}
    </div>
  )
}

// ── Alertas ───────────────────────────────────────────────────────────────────

function AlertasPanel({ data, onFiltrarEtapa }: { data: FluxoRow[]; onFiltrarEtapa: (e: string) => void }) {
  const semNota = useMemo(() => {
    const rows = data.filter(r => r.etapa_jornada === 'Finalizada - aguardando nota')
    const byEmpresa = Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => { acc[r.empresa] = (acc[r.empresa] ?? 0) + r.vlevento; return acc }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([empresa, valor]) => ({ empresa, valor }))
    return { quantidade: rows.length, valor: rows.reduce((s, r) => s + r.vlevento, 0), topEmpresas: byEmpresa }
  }, [data])

  const liquRepresadas = useMemo(() => {
    const rows = data.filter(r => r.etapa_jornada === 'Liquidada' && r.dias_na_etapa >= 30)
    const diasMedio = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.dias_na_etapa, 0) / rows.length) : 0
    return { quantidade: rows.length, valor: rows.reduce((s, r) => s + r.vlevento, 0), dias_medio: diasMedio }
  }, [data])

  const gargalo = useMemo(() => {
    let best: { etapa: string; quantidade: number; valor: number } | null = null
    for (const etapa of ETAPAS_CRITICAS) {
      const rows = data.filter(r => r.etapa_jornada === etapa)
      const valor = rows.reduce((s, r) => s + r.vlevento, 0)
      if (!best || valor > best.valor) best = { etapa, quantidade: rows.length, valor }
    }
    return best?.valor ? best : null
  }, [data])

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className={`card border-l-4 ${semNota.quantidade > 0 ? 'border-l-orange-500' : 'border-l-gray-200'}`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg flex-shrink-0 ${semNota.quantidade > 0 ? 'bg-orange-100' : 'bg-gray-100'}`}>
            <FileText size={16} className={semNota.quantidade > 0 ? 'text-orange-600' : 'text-gray-400'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Aguardando Nota Fiscal</p>
            <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{fmtNum(semNota.quantidade)}<span className="text-sm font-normal text-gray-500 ml-1.5">medições</span></p>
            <p className="text-xs text-gray-500 mt-0.5">{brl(semNota.valor)} em aberto</p>
            {semNota.topEmpresas.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {semNota.topEmpresas.map(e => (
                  <p key={e.empresa} className="text-xs text-gray-400 truncate">· {e.empresa.length > 28 ? e.empresa.slice(0, 28) + '…' : e.empresa}<span className="ml-1 text-orange-500 font-semibold">{brl(e.valor)}</span></p>
                ))}
              </div>
            )}
          </div>
        </div>
        {semNota.quantidade > 0 && (
          <button onClick={() => onFiltrarEtapa('Finalizada - aguardando nota')} className="mt-3 w-full text-xs font-semibold text-orange-600 hover:text-orange-800 text-center py-1.5 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors">Ver medições</button>
        )}
      </div>

      <div className={`card border-l-4 ${liquRepresadas.quantidade > 0 ? 'border-l-red-500' : 'border-l-gray-200'}`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg flex-shrink-0 ${liquRepresadas.quantidade > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
            <Landmark size={16} className={liquRepresadas.quantidade > 0 ? 'text-red-600' : 'text-gray-400'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Liquidadas há +30 dias</p>
            <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{fmtNum(liquRepresadas.quantidade)}<span className="text-sm font-normal text-gray-500 ml-1.5">medições</span></p>
            <p className="text-xs text-gray-500 mt-0.5">{brl(liquRepresadas.valor)} aguardando</p>
            {liquRepresadas.dias_medio > 0 && <p className="text-xs text-red-500 font-semibold mt-1">Média: {liquRepresadas.dias_medio} dias paradas</p>}
          </div>
        </div>
        {liquRepresadas.quantidade > 0 && (
          <button onClick={() => onFiltrarEtapa('Liquidada')} className="mt-3 w-full text-xs font-semibold text-red-600 hover:text-red-800 text-center py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">Ver medições</button>
        )}
      </div>

      <div className={`card border-l-4 ${gargalo ? 'border-l-violet-500' : 'border-l-gray-200'}`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg flex-shrink-0 ${gargalo ? 'bg-violet-100' : 'bg-gray-100'}`}>
            <TrendingDown size={16} className={gargalo ? 'text-violet-600' : 'text-gray-400'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Maior Gargalo</p>
            {gargalo ? (
              <>
                <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{fmtNum(gargalo.quantidade)}<span className="text-sm font-normal text-gray-500 ml-1.5">medições</span></p>
                <p className="text-xs text-violet-600 font-semibold mt-0.5">{gargalo.etapa}</p>
                <p className="text-xs text-gray-500 mt-0.5">{brl(gargalo.valor)} represados</p>
              </>
            ) : <p className="text-sm text-gray-400 mt-2">Nenhum gargalo identificado</p>}
          </div>
        </div>
        {gargalo && (
          <button onClick={() => onFiltrarEtapa(gargalo.etapa)} className="mt-3 w-full text-xs font-semibold text-violet-600 hover:text-violet-800 text-center py-1.5 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">Ver medições</button>
        )}
      </div>
    </div>
  )
}

// ── Gráficos de dimensão (NaoPagas) ──────────────────────────────────────────

type DimItem = { label: string; rawLabel?: string; valor: number; quantidade: number }

function parseMonthYear(value: string): Date | null {
  if (!value || value === '(sem competência)') return null
  const normalized = value.trim()
  const [rawMonth, rawYear] = normalized.split('/')
  if (!rawYear) return null

  const monthNames: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  }

  const monthNumber = Number(rawMonth)
  const parsedMonth = Number.isFinite(monthNumber) && monthNumber >= 1 && monthNumber <= 12
    ? monthNumber
    : monthNames[String(rawMonth).toLowerCase().slice(0, 3)] ?? null

  if (!parsedMonth) return null
  return new Date(Number(rawYear), parsedMonth - 1, 1)
}

function isCompetenciaAtrasada(value: string): boolean {
  const parsed = parseMonthYear(value)
  if (!parsed) return false
  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const cutoff = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
  return parsed.getTime() < cutoff.getTime()
}

function dimBarOption(items: DimItem[], color: string, activeValue?: string | null): Record<string, unknown> {
  const top = items.slice(0, 12)
  const labels = top.map(d => d.label)
  const values = top.map(d => d.valor)
  const qtds   = top.map(d => d.quantidade)
  return {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: { name: string; value: number; dataIndex: number }[]) => {
        const p = params[0]
        return `<b>${p.name}</b><br/>Valor: <b>${brl(p.value)}</b><br/>Medições: <b>${qtds[p.dataIndex]}</b>`
      },
    },
    grid: { left: '3%', right: '14%', bottom: '3%', top: 4, containLabel: true },
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: 'category', data: [...labels].reverse(), axisLabel: { fontSize: 11, width: 130, overflow: 'truncate' } },
    series: [{
      type: 'bar', data: [...values].reverse(), barMaxWidth: 22,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: activeValue
          ? (params: { dataIndex: number }) => {
              const lbl = [...labels].reverse()[params.dataIndex] ?? ''
              return lbl.toUpperCase().includes(activeValue.toUpperCase()) ? color : color + '40'
            }
          : color,
      },
      label: { show: true, position: 'right', fontSize: 11, formatter: (p: { value: number }) => brl(p.value) },
    }],
  }
}

function dimColumnOption(items: DimItem[], color: string): Record<string, unknown> {
  const top = items.slice(0, 18)
  const data = top.map(item => ({
    value: item.valor,
    name: item.label,
    quantidade: item.quantidade,
    itemStyle: {
      color: isCompetenciaAtrasada(item.rawLabel ?? item.label) ? '#ef4444' : color,
      borderRadius: [4, 4, 0, 0],
    },
  }))

  return {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: { name: string; value: number; data: { quantidade?: number } }[]) => {
        const p = params[0]
        return `<b>${p.name}</b><br/>Valor: <b>${brl(Number(p.value))}</b><br/>Medições: <b>${p.data.quantidade ?? 0}</b>`
      },
    },
    grid: { left: '3%', right: '4%', bottom: '18%', top: 6, containLabel: true },
    xAxis: {
      type: 'category',
      data: top.map(item => item.label),
      axisLabel: { fontSize: 11, interval: 0, rotate: 0 },
      axisTick: { alignWithLabel: true },
    },
    yAxis: { type: 'value', axisLabel: { show: false }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
    series: [{
      type: 'bar',
      data,
      barWidth: '52%',
      label: { show: true, position: 'top', fontSize: 10, formatter: (p: { value: number }) => brl(Number(p.value)) },
    }],
  }
}

function DimChart({ title, items, color, icon, loading, onBarClick, activeValue, chartType = 'bar' }: {
  title: string; items: DimItem[]; color: string; icon: ReactNode
  loading?: boolean; onBarClick?: (v: string) => void; activeValue?: string | null; chartType?: 'bar' | 'column'
}) {
  const height = Math.max(160, Math.min(items.length, 12) * 26 + 50)
  const option = useMemo(() => chartType === 'column' ? dimColumnOption(items, color) : dimBarOption(items, color, activeValue), [chartType, items, color, activeValue])
  const events = useMemo(() => onBarClick ? { click: (p: unknown) => onBarClick((p as { name: string }).name) } : undefined, [onBarClick])

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: color + '18', color }}>{icon}</div>
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        </div>
        {activeValue && <span className="text-xs text-gray-400 italic truncate max-w-[140px]">filtro: {activeValue}</span>}
      </div>
      {loading
        ? <div className="skeleton" style={{ height }} />
        : items.length === 0
          ? <p className="text-sm text-gray-400 py-6 text-center">Sem dados</p>
          : <EChart option={option} height={chartType === 'column' ? Math.max(220, items.length * 32 + 50) : height} onEvents={events} className={onBarClick ? 'cursor-pointer' : ''} />
      }
    </div>
  )
}

// ── Tabela ────────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null
type SortKey = 'empresa' | 'mes_ano' | 'vlevento' | 'dias_na_etapa'
const PAGE_SIZE = 20

function rowHighlight(row: FluxoRow): string {
  const isCritical = ETAPAS_CRITICAS.has(row.etapa_jornada)
  if (isCritical && row.dias_na_etapa >= 30) return 'bg-red-50 hover:bg-red-100'
  if (isCritical && row.dias_na_etapa >= 15) return 'bg-amber-50 hover:bg-amber-100'
  return 'hover:bg-gray-50'
}

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey | null; dir: SortDir } }) {
  if (sort.key !== col) return <ChevronsUpDown size={12} className="text-gray-300 ml-0.5" />
  if (sort.dir === 'asc') return <ChevronUp size={12} className="text-blue-500 ml-0.5" />
  return <ChevronDown size={12} className="text-blue-500 ml-0.5" />
}

function FluxoTable({ data, localSearch, onLocalSearch }: {
  data: FluxoRow[]
  localSearch: string
  onLocalSearch: (v: string) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: null })
  const [page, setPage] = useState(1)

  function toggleSort(key: SortKey) {
    setSort(prev => prev.key !== key ? { key, dir: 'desc' } : prev.dir === 'desc' ? { key, dir: 'asc' } : { key: null, dir: null })
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = localSearch.trim().toUpperCase()
    if (!q) return data
    return data.filter(r =>
      r.empresa.toUpperCase().includes(q) ||
      r.contrato.toUpperCase().includes(q) ||
      r.rodovias.toUpperCase().includes(q)
    )
  }, [data, localSearch])

  const sorted = useMemo(() => {
    if (!sort.key || !sort.dir) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sort.key!] as string | number
      const bv = b[sort.key!] as string | number
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageData   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function ColHeader({ label, col }: { label: string; col: SortKey }) {
    return (
      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none whitespace-nowrap" onClick={() => toggleSort(col)}>
        <span className="flex items-center gap-0.5">{label}<SortIcon col={col} sort={sort} /></span>
      </th>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={localSearch} onChange={e => { onLocalSearch(e.target.value); setPage(1) }}
            placeholder="Filtrar por empresa, contrato ou rodovia..."
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
          />
          {localSearch && <button onClick={() => { onLocalSearch(''); setPage(1) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X size={13} /></button>}
        </div>
        <span className="text-xs text-gray-400">{fmtNum(sorted.length)} medições{sorted.length !== data.length && ` (de ${fmtNum(data.length)})`}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <ColHeader label="Empresa"     col="empresa" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Rodovia</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Contrato / Med.</th>
              <ColHeader label="Competência" col="mes_ano" />
              <ColHeader label="Valor"       col="vlevento" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Etapa</th>
              <ColHeader label="Dias"        col="dias_na_etapa" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageData.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-400">Nenhuma medição encontrada</td></tr>
            ) : pageData.map(row => (
              <tr key={row.id} className={`transition-colors ${rowHighlight(row)}`}>
                <td className="px-3 py-2.5 max-w-[180px]">
                  <span className="block truncate text-sm font-medium text-gray-800" title={row.empresa}>{row.empresa || '—'}</span>
                  {row.tipo_contrato && <span className="text-xs text-gray-400">{row.tipo_contrato}</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{row.rodovias || '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="font-mono text-xs font-semibold text-gray-700">{row.contrato}</span>
                  <span className="text-xs text-gray-400 ml-1">#{row.num_medicao}</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{row.mes_ano || '—'}</td>
                <td className="px-3 py-2.5 text-sm font-semibold text-gray-800 whitespace-nowrap text-right">{brlFull(row.vlevento)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{etapaBadge(row.etapa_jornada)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{diasBadge(row.etapa_jornada, row.dias_na_etapa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-gray-400">Página {page} de {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">Anterior</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">Próxima</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Filtros ───────────────────────────────────────────────────────────────────

function FilterBar({
  empresa, onEmpresa, rodovia, onRodovia, natureza, onNatureza,
  competenciaDe, onCompetenciaDe, competenciaAte, onCompetenciaAte,
  empresasOpts, rodoviaOpts, naturezaOpts, onLimpar, activeCount, onHelp,
}: {
  empresa: string | null; onEmpresa: (v: string | null) => void
  rodovia: string | null; onRodovia: (v: string | null) => void
  natureza: string | null; onNatureza: (v: string | null) => void
  competenciaDe: string; onCompetenciaDe: (v: string) => void
  competenciaAte: string; onCompetenciaAte: (v: string) => void
  empresasOpts: string[]; rodoviaOpts: string[]; naturezaOpts: string[]
  onLimpar: () => void; activeCount: number; onHelp: () => void
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-64">
          <ComboBox label="Empresa" value={empresa} options={empresasOpts} onChange={onEmpresa} allLabel="Todas as empresas" />
        </div>
        <div className="w-44">
          <ComboBox label="Rodovia" value={rodovia} options={rodoviaOpts} onChange={onRodovia} allLabel="Todas" />
        </div>
        <div className="w-44">
          <ComboBox label="Natureza" value={natureza} options={naturezaOpts} onChange={onNatureza} allLabel="Todas" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Competência de</p>
          <MonthPicker value={competenciaDe} onChange={onCompetenciaDe} placeholder="Início" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Até</p>
          <MonthPicker value={competenciaAte} onChange={onCompetenciaAte} placeholder="Fim" />
        </div>
        <div className="ml-auto flex items-end gap-3 pt-6 flex-wrap">
          {activeCount > 0 && (
            <button onClick={onLimpar} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
              <X size={12} />
              Limpar filtros
              <span className="bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">{activeCount}</span>
            </button>
          )}
          <button onClick={onHelp} title="Ajuda sobre esta tela" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-200 transition-colors">
            <HelpCircle size={13} />Ajuda
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de ajuda ────────────────────────────────────────────────────────────

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto mx-4 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-100 rounded-lg"><HelpCircle size={16} className="text-blue-600" /></div>
            <h2 className="text-base font-semibold text-gray-800">Rastreio de Pagamentos — Guia da tela</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-6 text-sm text-gray-600">
          <p className="text-gray-500 leading-relaxed">
            Esta tela acompanha o ciclo financeiro de cada medição — desde a aprovação pelo DER-PE até o pagamento à empresa contratada.
            Use os filtros para focar em empresa, rodovia ou período, e clique nos cards e no funil para filtrar a tabela de rastreio.
          </p>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Indicadores (KPIs)</h3>
            <div className="space-y-3">
              {[
                { color: 'bg-blue-500', title: 'Em Aberto', desc: 'Total de medições que ainda não foram pagas integralmente, independente da etapa. Representa toda a exposição financeira atual no fluxo de pagamentos.' },
                { color: 'bg-teal-500', title: 'Aguardando Pagamento', desc: 'Medições já liquidadas — empenho processado, nota aceita — mas ainda sem pagamento efetivo transferido. Ação esperada: área financeira libera o pagamento.' },
                { color: 'bg-orange-500', title: 'Aguardando Nota', desc: 'Medições aprovadas e com todas as assinaturas concluídas, mas sem nota fiscal emitida pela empresa. Ação esperada: empresa emite a nota no sistema.' },
                { color: 'bg-red-500', title: 'Alertas Críticos', desc: 'Medições em etapas financeiras sensíveis (Ag. Nota, Nota Emitida, Liquidada ou Paga Parcialmente) sem nenhuma movimentação há mais de 30 dias. São os casos que mais exigem atenção imediata.' },
              ].map(({ color, title, desc }) => (
                <div key={title} className="flex gap-3">
                  <span className={`mt-0.5 w-2 h-2 rounded-full ${color} flex-shrink-0`} />
                  <div>
                    <p className="font-semibold text-gray-700">{title}</p>
                    <p className="text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Jornada Completa das Medições</h3>
            <p className="text-gray-500 leading-relaxed mb-2">
              Mostra quantas medições estão em cada etapa do ciclo financeiro. As etapas são, em ordem:
            </p>
            <ol className="space-y-1.5 pl-1">
              {[
                ['Criada', 'Medição aberta, sem valor lançado ainda.'],
                ['Iniciada', 'Valor lançado, aguardando aprovação formal.'],
                ['Assinatura pendente', 'Aprovada pelo sistema, mas faltam assinaturas digitais dos fiscais.'],
                ['Ag. Nota', 'Todas as assinaturas concluídas. Empresa deve emitir a nota fiscal.'],
                ['Nota Emitida', 'Nota fiscal recebida. Aguardando liquidação (empenho) pelo DER-PE.'],
                ['Liquidada', 'Empenho realizado. Aguardando pagamento financeiro.'],
                ['Paga Parc.', 'Parte do valor foi paga. Saldo remanescente em aberto.'],
                ['Paga Integr.', 'Pagamento 100% concluído. Medição encerrada.'],
              ].map(([etapa, desc]) => (
                <li key={etapa} className="flex gap-2">
                  <span className="font-semibold text-gray-700 whitespace-nowrap">{etapa}:</span>
                  <span className="text-gray-500">{desc}</span>
                </li>
              ))}
            </ol>
            <p className="text-gray-400 mt-2 text-xs">Clique em qualquer etapa para filtrar a tabela de rastreio abaixo.</p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Atenção Imediata</h3>
            <div className="space-y-2.5">
              <div>
                <p className="font-semibold text-gray-700">Aguardando Nota Fiscal</p>
                <p className="text-gray-500 leading-relaxed">Medições que já passaram por todas as aprovações e assinaturas mas ainda não têm nota fiscal emitida. Mostra também as top 3 empresas com maior valor represado, para facilitar a cobrança.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700">Liquidadas há +30 dias</p>
                <p className="text-gray-500 leading-relaxed">Medições com empenho concluído há mais de 30 dias sem pagamento. Indica represamento financeiro no DER-PE — não é problema da empresa contratada.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700">Maior Gargalo</p>
                <p className="text-gray-500 leading-relaxed">A etapa financeira com maior valor total represado entre todas as etapas críticas. Indica onde concentrar energia para destravar o maior volume de recursos.</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Tabela de Rastreio</h3>
            <p className="text-gray-500 leading-relaxed mb-2">Lista detalhada de todas as medições, ordenada por urgência:</p>
            <ul className="space-y-1 pl-1 text-gray-500">
              <li>· Linhas <span className="text-red-600 font-semibold">vermelhas</span> = etapa crítica há mais de 30 dias</li>
              <li>· Linhas <span className="text-amber-600 font-semibold">amarelas</span> = etapa crítica há 15–30 dias</li>
              <li>· A coluna <span className="font-semibold text-gray-700">Dias</span> indica há quantos dias a medição está parada na etapa atual</li>
              <li>· Use a busca rápida para filtrar por empresa, contrato ou rodovia</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Painel principal ──────────────────────────────────────────────────────────

interface Props {
  data: Record<string, unknown>[]
}

export function FluxoMedicoes({ data: rawData }: Props) {
  const rows = useMemo(() => mapSnapshot(rawData), [rawData])

  const currentYear = new Date().getFullYear()
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0')
  const defaultCompetenciaDe = `${currentYear}-01`
  const defaultCompetenciaAte = `${currentYear}-${currentMonth}`

  const [empresa,        setEmpresa]        = useState<string | null>(null)
  const [rodovia,        setRodovia]        = useState<string | null>(null)
  const [natureza,       setNatureza]       = useState<string | null>(null)
  const [competenciaDe,  setCompetenciaDe]  = useState(defaultCompetenciaDe)
  const [competenciaAte, setCompetenciaAte] = useState(defaultCompetenciaAte)
  const [etapaFiltro,    setEtapaFiltro]    = useState<string | null>(null)
  const [diretoriaFiltro,setDiretoriaFiltro]= useState<string | null>(null)
  const [localSearch,    setLocalSearch]    = useState('')
  const [showHelp,       setShowHelp]       = useState(false)
  const [activePage,     setActivePage]     = useState<'resumo' | 'analitico' | 'rastreio'>('resumo')

  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (etapaFiltro && tableRef.current) tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [etapaFiltro])

  // Opções dos filtros
  const options = useMemo(() => ({
    empresas:  [...new Set(rows.map(r => r.empresa).filter(Boolean))].sort(),
    rodovias:  [...new Set(rows.flatMap(r => (r.rodovias || '').split(',').map(s => s.trim())).filter(Boolean))].sort(),
    naturezas: [...new Set(rows.map(r => r.natureza).filter(Boolean))].sort(),
    diretorias:[...new Set(rows.map(r => r.diretoria).filter(Boolean))].sort(),
  }), [rows])

  // Filtros sem etapa (para funil e alertas)
  const filteredBase = useMemo(() => {
    return rows.filter(r => {
      if (empresa  && r.empresa !== empresa)   return false
      if (rodovia  && !r.rodovias.includes(rodovia)) return false
      if (natureza && r.natureza !== natureza) return false
      if (diretoriaFiltro && r.diretoria !== diretoriaFiltro) return false
      if (competenciaDe) {
        // mes_ano format: "MM/YYYY", filter: "YYYY-MM"
        const [mm, yyyy] = (r.mes_ano || '').split('/')
        const rowKey = mm && yyyy ? `${yyyy}-${mm}` : ''
        if (rowKey < competenciaDe) return false
      }
      if (competenciaAte) {
        const [mm, yyyy] = (r.mes_ano || '').split('/')
        const rowKey = mm && yyyy ? `${yyyy}-${mm}` : ''
        if (rowKey > competenciaAte) return false
      }
      return true
    })
  }, [rows, empresa, rodovia, natureza, diretoriaFiltro, competenciaDe, competenciaAte])

  // Com etapa (para tabela)
  const filtered = useMemo(() => {
    if (!etapaFiltro) return filteredBase
    if (etapaFiltro === 'EM_ABERTO') return filteredBase.filter(r => ['Assinatura pendente', 'Finalizada - aguardando nota', 'Nota emitida', 'Liquidada', 'Paga parcialmente'].includes(r.etapa_jornada))
    if (etapaFiltro === 'ALERTAS_CRITICOS') return filteredBase.filter(r => ETAPAS_CRITICAS.has(r.etapa_jornada) && r.dias_na_etapa >= 30)
    return filteredBase.filter(r => r.etapa_jornada === etapaFiltro)
  }, [filteredBase, etapaFiltro])

  const activeFilterCount = [empresa, rodovia, natureza, competenciaDe, competenciaAte, diretoriaFiltro].filter(Boolean).length

  function limpar() {
    setEmpresa(null); setRodovia(null); setNatureza(null)
    setCompetenciaDe(defaultCompetenciaDe)
    setCompetenciaAte(defaultCompetenciaAte)
    setEtapaFiltro(null); setDiretoriaFiltro(null); setLocalSearch('')
  }

  // Dimensões (NaoPagas — etapas fechadas mas não pagas)
  const naoPagasRows = useMemo(() => filteredBase.filter(r => ['Assinatura pendente','Finalizada - aguardando nota','Nota emitida','Liquidada','Paga parcialmente'].includes(r.etapa_jornada)), [filteredBase])

  // KPIs
  const kpis = useMemo(() => {
    const emAberto     = naoPagasRows
    const aguPgto      = filteredBase.filter(r => r.etapa_jornada === 'Liquidada')
    const aguNota      = filteredBase.filter(r => r.etapa_jornada === 'Finalizada - aguardando nota')
    const alertasCrit  = filteredBase.filter(r => ETAPAS_CRITICAS.has(r.etapa_jornada) && r.dias_na_etapa >= 30)
    return {
      em_aberto:            emAberto.length,
      valor_em_aberto:      emAberto.reduce((s, r) => s + r.vlevento, 0),
      aguardando_pagamento: aguPgto.length,
      valor_aguardando_pgto:aguPgto.reduce((s, r) => s + r.vlevento, 0),
      aguardando_nota:      aguNota.length,
      valor_aguardando_nota:aguNota.reduce((s, r) => s + r.vlevento, 0),
      alertas_criticos:     alertasCrit.length,
      valor_alertas:        alertasCrit.reduce((s, r) => s + r.vlevento, 0),
    }
  }, [filteredBase, naoPagasRows])

  function dimItems(key: (r: FluxoRow) => string): DimItem[] {
    const acc: Record<string, { valor: number; quantidade: number }> = {}
    for (const r of naoPagasRows) {
      const k = key(r) || '(sem info)'
      if (!acc[k]) acc[k] = { valor: 0, quantidade: 0 }
      acc[k].valor     += r.vlevento
      acc[k].quantidade += 1
    }
    return Object.entries(acc).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.valor - a.valor)
  }

  function dimItemsMultiValue(key: (r: FluxoRow) => string[]): DimItem[] {
    const acc: Record<string, { valor: number; quantidade: number }> = {}
    for (const r of naoPagasRows) {
      const values = key(r).map(v => v.trim()).filter(Boolean)
      if (!values.length) {
        const fallback = '(sem info)'
        if (!acc[fallback]) acc[fallback] = { valor: 0, quantidade: 0 }
        acc[fallback].valor += r.vlevento
        acc[fallback].quantidade += 1
        continue
      }
      for (const value of values) {
        if (!acc[value]) acc[value] = { valor: 0, quantidade: 0 }
        acc[value].valor += r.vlevento / values.length
        acc[value].quantidade += 1
      }
    }
    return Object.entries(acc).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.valor - a.valor)
  }

  const dimEmpresa   = useMemo(() => dimItems(r => r.empresa),   [naoPagasRows]) // eslint-disable-line react-hooks/exhaustive-deps
  const dimRodovia   = useMemo(() => dimItemsMultiValue(r => (r.rodovias || '').split(',').map(v => v.trim())), [naoPagasRows]) // eslint-disable-line react-hooks/exhaustive-deps
  const dimSetor     = useMemo(() => dimItems(r => r.diretoria), [naoPagasRows]) // eslint-disable-line react-hooks/exhaustive-deps
  const dimCompetencia = useMemo(() => {
    const acc: Record<string, { valor: number; quantidade: number }> = {}
    for (const r of naoPagasRows) {
      const key = r.mes_ano || '(sem competência)'
      if (!acc[key]) acc[key] = { valor: 0, quantidade: 0 }
      acc[key].valor += r.vlevento
      acc[key].quantidade += 1
    }

    return Object.entries(acc)
      .map(([label, v]) => ({ label, rawLabel: label, ...v }))
      .sort((a, b) => {
        const dateA = parseMonthYear(a.rawLabel ?? a.label) ?? new Date(0)
        const dateB = parseMonthYear(b.rawLabel ?? b.label) ?? new Date(0)
        return dateA.getTime() - dateB.getTime()
      })
      .map((item) => ({
        ...item,
        label: item.rawLabel === '(sem competência)' ? '(sem competência)' : formatMonthYearLabel(item.rawLabel ?? item.label),
      }))
  }, [naoPagasRows])

  function formatMonthYearLabel(value: string) {
    const [month, year] = value.split('/')
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const monthIndex = Number(month) - 1
    return `${monthNames[monthIndex] ?? month}/${year}`
  }

  function handleDimClick(setter: (v: string | null) => void, current: string | null, valor: string) {
    setter(current === valor ? null : valor)
    setLocalSearch('')
    setActivePage('rastreio')
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  function handleEtapa(etapa: string | null) { setEtapaFiltro(etapa); setLocalSearch(''); setActivePage('rastreio') }
  function handleFiltrarEtapa(etapa: string) { setEtapaFiltro(prev => prev === etapa ? null : etapa); setLocalSearch(''); setActivePage('rastreio') }

  const lookupEtapaLabel = (etapa: string | null) => {
    if (!etapa) return null
    if (etapa === 'EM_ABERTO') return 'Em Aberto'
    if (etapa === 'ALERTAS_CRITICOS') return 'Alertas Críticos'
    return etapa
  }

  return (
    <div className="space-y-5">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {/* Filtros */}
      <FilterBar
        empresa={empresa}               onEmpresa={setEmpresa}
        rodovia={rodovia}               onRodovia={setRodovia}
        natureza={natureza}             onNatureza={setNatureza}
        competenciaDe={competenciaDe}   onCompetenciaDe={setCompetenciaDe}
        competenciaAte={competenciaAte} onCompetenciaAte={setCompetenciaAte}
        empresasOpts={options.empresas}
        rodoviaOpts={options.rodovias}
        naturezaOpts={options.naturezas}
        onLimpar={limpar}
        activeCount={activeFilterCount}
        onHelp={() => setShowHelp(true)}
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-100 p-1.5 inline-flex flex-wrap gap-1.5 w-full md:w-auto shadow-sm">
        {[
          { id: 'resumo', label: 'Resumo' },
          { id: 'analitico', label: 'Análise' },
          { id: 'rastreio', label: 'Rastreio' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActivePage(tab.id as 'resumo' | 'analitico' | 'rastreio')}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
              activePage === tab.id
                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activePage === 'resumo' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Em Aberto" value={fmtNum(kpis.em_aberto)} subtitle={`${brl(kpis.valor_em_aberto)} ainda não pago`} icon={<CircleAlert size={18} />} accent="blue" onClick={kpis.em_aberto ? () => handleFiltrarEtapa('EM_ABERTO') : undefined} tooltip="Medições já fechadas e que ainda não foram pagas." />
            <KpiCard title="Ag. Pagamento" value={fmtNum(kpis.aguardando_pagamento)} subtitle={`${brl(kpis.valor_aguardando_pgto)} liquidados`} icon={<Banknote size={18} />} accent="teal" onClick={kpis.aguardando_pagamento ? () => handleFiltrarEtapa('Liquidada') : undefined} tooltip="Medições já liquidadas aguardando transferência do pagamento." />
            <KpiCard title="Ag. Nota Fiscal" value={fmtNum(kpis.aguardando_nota)} subtitle={`${brl(kpis.valor_aguardando_nota)} em aberto`} icon={<FileText size={18} />} accent="orange" onClick={kpis.aguardando_nota ? () => handleFiltrarEtapa('Finalizada - aguardando nota') : undefined} tooltip="Medições aprovadas aguardando nota fiscal da empresa." />
            <KpiCard title="Alertas Críticos" value={fmtNum(kpis.alertas_criticos)} subtitle={`${brl(kpis.valor_alertas)} represados +30d`} icon={<AlertTriangle size={18} />} accent="red" onClick={kpis.alertas_criticos ? () => handleFiltrarEtapa('ALERTAS_CRITICOS') : undefined} tooltip="Medições em etapas financeiras sem movimentação há mais de 30 dias." />
          </div>

          <div className="card">
            <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Jornada Completa das Medições</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Clique em uma etapa para filtrar a tabela
                  {etapaFiltro && <button onClick={() => setEtapaFiltro(null)} className="ml-2 text-blue-500 hover:text-blue-700 font-semibold">· Limpar</button>}
                </p>
              </div>
              {etapaFiltro && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{lookupEtapaLabel(etapaFiltro)}</span>}
            </div>
            <FunilCompleto data={filteredBase} activeEtapa={etapaFiltro} onEtapaClick={handleEtapa} />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Atenção Imediata</h2>
            <AlertasPanel data={filteredBase} onFiltrarEtapa={handleFiltrarEtapa} />
          </div>
        </div>
      )}

      {activePage === 'analitico' && (
        <div className="card space-y-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-gray-800">Medições em aberto</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Medições já fechadas e não pagas · clique nos gráficos para filtrar a tabela
            </p>
          </div>
          <div className="mt-0 mb-4">
            <DimChart title="Por Competência" items={dimCompetencia} color="#EC4899" icon={<BarChart3 size={14} />} chartType="column" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DimChart title="Por Empresa" items={dimEmpresa} color="#F97316" icon={<Building2 size={14} />} onBarClick={v => handleDimClick(setEmpresa, empresa, v)} activeValue={empresa} />
            <DimChart title="Por Rodovia" items={dimRodovia} color="#10B981" icon={<BarChart3 size={14} />} onBarClick={v => handleDimClick(setRodovia, rodovia, v)} activeValue={rodovia} />
            <DimChart title="Por Setor" items={dimSetor} color="#8B5CF6" icon={<BarChart3 size={14} />} />
          </div>
        </div>
      )}

      {activePage === 'rastreio' && (
        <div ref={tableRef} className="card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Rastreio de Medições</h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Crítico +30d</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Atenção 15–30d</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {etapaFiltro && <button onClick={() => setEtapaFiltro(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"><X size={11} />{lookupEtapaLabel(etapaFiltro)}</button>}
              {diretoriaFiltro && <button onClick={() => setDiretoriaFiltro(null)} className="flex items-center gap-1 text-xs text-emerald-600 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-50"><X size={11} />{diretoriaFiltro}</button>}
            </div>
          </div>
          <FluxoTable data={filtered} localSearch={localSearch} onLocalSearch={setLocalSearch} />
        </div>
      )}
    </div>
  )
}
