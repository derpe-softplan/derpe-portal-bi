import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react'
import {
  ArrowRight,
  AlertTriangle,
  Banknote,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  X,
  FileText,
  Calendar,
  TrendingDown,
  CircleAlert,
  Building2,
  BarChart3,
  HelpCircle,
  SlidersHorizontal,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cronogramaApi, medicaoApi, type MedicaoAssinatura } from '../../services/api'
import { useTheme } from '../../context/ThemeContext'
import Cronograma from '../../pages/Cronograma'
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
  municipios: string
  natureza: string
  tipo_contrato: string | null
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
  empenho_total: number
  valor_executado: number
  saldo_empenho: number
  ultimo_vlevento_contrato: number
  dt_fim: string | null
  dt_fim_execucao: string | null
  saldo_insuficiente: boolean
  skmedicao: number
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
    case 'Finalizada - aguardando nota':
      return daysSince(row.dt_aprovacao)
    case 'Nota emitida':
      return daysSince(row.dt_envio_sei || row.dt_aprovacao)
    case 'Liquidada':
      return daysSince(row.dt_ultima_liq)
    case 'Paga parcialmente':
      return daysSince(row.dt_ultimo_pgto)
    case 'Assinatura pendente':
      return daysSince(row.dt_aprovacao)
    default: {
      const base = row.dt_fim ?? row.dt_medicao
      if (!base) return 0
      const d = new Date(base)
      if (isNaN(d.getTime())) return 0
      if (row.dt_fim) d.setDate(d.getDate() + 1)
      return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
    }
  }
}

// ── Integração Cronograma ─────────────────────────────────────────────────────

function scheduleForComp(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

function diasNoMes(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function expectedStageToday(
  compYear: number,
  compMonth: number,
  config: Record<number, string>
): { stage: string | null; status: 'active' | 'before' | 'after' | 'noconfig' } {
  if (Object.keys(config).length === 0) return { stage: null, status: 'noconfig' }

  const sched = scheduleForComp(compYear, compMonth)
  const today = new Date()
  const ty = today.getFullYear(),
    tm = today.getMonth() + 1,
    td = today.getDate()

  if (ty < sched.year || (ty === sched.year && tm < sched.month)) {
    return { stage: null, status: 'before' }
  }

  const status = ty === sched.year && tm === sched.month ? ('active' as const) : ('after' as const)
  const refDay = status === 'active' ? td : diasNoMes(sched.year, sched.month)

  // Look back to nearest configured day (weekends/holidays are blank)
  for (let d = refDay; d >= 1; d--) {
    if (config[d]) return { stage: config[d], status }
  }
  return { stage: null, status }
}

export function mapSnapshot(raw: Record<string, unknown>[]): FluxoRow[] {
  return raw.map((r) => {
    const empresaRaw = String(r['Empresa'] ?? '')
    const row: FluxoRow = {
      id: String(r['MedicaoId'] ?? ''),
      contrato: String(r['Contrato'] ?? ''),
      num_medicao: Number(r['Medição'] ?? 0),
      empresa: empresaRaw.split(';')[0].trim(),
      rodovias: String(r['Rodovias'] ?? ''),
      municipios: String(r['Municípios'] ?? ''),
      natureza: String(r['Natureza'] ?? ''),
      tipo_contrato: r['Tipo de contrato'] ? String(r['Tipo de contrato']) : null,
      distrito: String(r['Distrito'] ?? ''),
      vlevento: Number(r['Valor Medido Reajustado'] ?? 0),
      valor_pago: Number(r['Valor Pago'] ?? 0),
      valor_liquidado: Number(r['Valor Liquidado'] ?? 0),
      qtd_notas: Number(r['Qtd Notas'] ?? 0),
      etapa_jornada: (() => {
        const e = String(r['Etapa Atual da Jornada'] ?? '')
        return ETAPAS_ORDER.includes(e) ? e : 'Criada'
      })(),
      status_pgto: String(r['Status Pagamento'] ?? ''),
      mes_ano: String(r['Mês/Ano'] ?? ''),
      dt_aprovacao: r['Data da aprovação'] ? String(r['Data da aprovação']) : null,
      dt_envio_sei: r['Data do SEI'] ? String(r['Data do SEI']) : null,
      dt_ultima_liq: r['Data Última Liquidação'] ? String(r['Data Última Liquidação']) : null,
      dt_ultimo_pgto: r['Data Último Pagamento'] ? String(r['Data Último Pagamento']) : null,
      dt_medicao: r['Data da medição'] ? String(r['Data da medição']) : null,
      dt_fim: r['Data Fim'] ? String(r['Data Fim']) : null,
      qt_faltam: Number(r['QT_FALTAM'] ?? 0),
      dias_na_etapa: 0,
      empenho_total: Number(r['Empenho Total'] ?? 0),
      valor_executado: Number(r['Valor Executado'] ?? 0),
      saldo_empenho: Number(r['Saldo Empenho'] ?? 0),
      ultimo_vlevento_contrato: Number(r['Último Valor Medido (Contrato)'] ?? 0),
      dt_fim_execucao: r['Data Fim Execução'] ? String(r['Data Fim Execução']) : null,
      saldo_insuficiente: r['Saldo para Próxima Medição'] === 'Insuficiente',
      skmedicao: Number(r['SkMedicao'] ?? 0),
    }
    row.dias_na_etapa = computeDias(row)
    return row
  })
}

// ── Constantes de etapas ──────────────────────────────────────────────────────

const ETAPA_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
  Criada: { bg: '#F9FAFB', color: '#6B7280', border: '#D1D5DB' },
  Iniciada: { bg: '#E0F2FE', color: '#0369A1', border: '#7DD3FC' },
  'Assinatura pendente': { bg: '#FEF3C7', color: '#B45309', border: '#FCD34D' },
  'Finalizada - aguardando nota': { bg: '#FFF7ED', color: '#C2410C', border: '#FDBA74' },
  'Nota emitida': { bg: '#F5F3FF', color: '#6D28D9', border: '#C4B5FD' },
  Liquidada: { bg: '#ECFEFF', color: '#0E7490', border: '#67E8F9' },
  'Paga parcialmente': { bg: '#F7FEE7', color: '#4D7C0F', border: '#BEF264' },
  'Paga integralmente': { bg: '#F0FDF4', color: '#166534', border: '#86EFAC' },
}

const ETAPA_COLORS: Record<string, string> = {
  Criada: '#9CA3AF',
  Iniciada: '#0EA5E9',
  'Assinatura pendente': '#F59E0B',
  'Finalizada - aguardando nota': '#F97316',
  'Nota emitida': '#8B5CF6',
  Liquidada: '#06B6D4',
  'Paga parcialmente': '#84CC16',
  'Paga integralmente': '#16A34A',
}

const ETAPAS_ORDER = [
  'Criada',
  'Iniciada',
  'Assinatura pendente',
  'Finalizada - aguardando nota',
  'Nota emitida',
  'Liquidada',
  'Paga parcialmente',
  'Paga integralmente',
]

// ── Utilitário de competência ─────────────────────────────────────────────────

function parseMesAno(s: string): { month: number; year: number } | null {
  if (!s) return null
  const [mm, yyyy] = s.split('/')
  const m = Number(mm),
    y = Number(yyyy)
  if (!Number.isFinite(m) || !Number.isFinite(y) || m < 1 || m > 12) return null
  return { month: m, year: y }
}

const ETAPAS_CRITICAS = new Set([
  'Finalizada - aguardando nota',
  'Nota emitida',
  'Liquidada',
  'Paga parcialmente',
])

// ── Formatadores ──────────────────────────────────────────────────────────────

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v)

const brlFull = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtNum = (v: number) => v.toLocaleString('pt-BR')

// ── Badges ────────────────────────────────────────────────────────────────────

function etapaBadge(etapa: string) {
  const cfg = ETAPA_CONFIG[etapa] ?? { bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' }
  return (
    <span
      className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }}
    >
      {etapa}
    </span>
  )
}

function diasBadge(etapa: string, dias: number) {
  if (etapa === 'Paga integralmente')
    return <span className="text-xs font-semibold text-emerald-600">Concluída</span>
  if (!ETAPAS_CRITICAS.has(etapa)) return <span className="text-xs text-gray-400 dark:text-gray-500">{dias}d</span>
  const cls =
    dias >= 30
      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold'
      : dias >= 15
        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{dias}d</span>
}

// ── Modal de Detalhes da Medição ──────────────────────────────────────────────

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(/Z|[+-]\d{2}:/.test(s) ? s : s + 'Z')
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 leading-snug">
        {children ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
      </dd>
    </div>
  )
}

function MedicaoModal({ row, onClose }: { row: FluxoRow; onClose: () => void }) {
  const [tab, setTab] = useState<'detalhes' | 'assinaturas'>('detalhes')

  const { data: assinaturas = [], isLoading } = useQuery({
    queryKey: ['medicao-assinaturas', row.skmedicao],
    queryFn: () => medicaoApi.getAssinaturas(String(row.skmedicao)).then((r) => r.data),
    staleTime: 2 * 60 * 1000,
    enabled: !!row.skmedicao,
  })

  const siderUrl = useMemo(() => {
    const first = assinaturas.find((a) => a.nutitulo && a.nuseqmedicaoh)
    if (!first) return null
    return `https://sider.der.pe.gov.br/smo/editarMedicaohsmo.do?entity.qyMedicao.medicaohPK.nuSeqmedicaoh=${first.nuseqmedicaoh}&entity.qyMedicao.medicaohPK.nuTitulo=${first.nutitulo}`
  }, [assinaturas])

  const validAssinaturas = assinaturas.filter((a) => a.nmpapel)
  const pendentes = validAssinaturas.filter((a) => a.nmsituacao !== 'ASSINADO')
  const assinados = validAssinaturas.filter((a) => a.nmsituacao === 'ASSINADO')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{row.empresa}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500 dark:text-gray-400">
              <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{row.contrato}</span>
              <span className="text-gray-300">·</span>
              <span>Medição #{row.num_medicao}</span>
              <span className="text-gray-300">·</span>
              <span>Comp. {row.mes_ano}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isLoading && <Loader2 size={14} className="text-gray-400 animate-spin" />}
            {siderUrl && (
              <a
                href={siderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gov-blue hover:bg-gov-blue-dark px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                <ExternalLink size={12} />
                Abrir no SIDER
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex border-b border-gray-100 dark:border-gray-700 px-6">
          {[
            { id: 'detalhes', label: 'Detalhes' },
            {
              id: 'assinaturas',
              label: `Assinaturas${validAssinaturas.length ? ` (${validAssinaturas.length})` : ''}`,
            },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'detalhes' | 'assinaturas')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? 'border-gov-blue text-gov-blue'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Detalhes ── */}
          {tab === 'detalhes' && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                  Situação atual
                </p>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <Field label="Etapa">{etapaBadge(row.etapa_jornada)}</Field>
                  <Field label="Dias na etapa">
                    {diasBadge(row.etapa_jornada, row.dias_na_etapa)}
                  </Field>
                  {row.qt_faltam > 0 && (
                    <Field label="Assinaturas pendentes">
                      <span className="text-sm font-semibold text-amber-600">
                        {row.qt_faltam} faltando
                      </span>
                    </Field>
                  )}
                </dl>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                  Identificação
                </p>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <Field label="Contrato">{row.contrato}</Field>
                  <Field label="Medição">#{row.num_medicao}</Field>
                  <Field label="Competência">{row.mes_ano}</Field>
                  <Field label="Natureza">{row.natureza}</Field>
                  <Field label="Tipo de contrato">{row.tipo_contrato}</Field>
                  <Field label="Distrito">{row.distrito}</Field>
                  <div className="col-span-2">
                    <Field label="Rodovias">{row.rodovias}</Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Municípios">{row.municipios}</Field>
                  </div>
                </dl>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                  Financeiro
                </p>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <Field label="Valor medido">{brlFull(row.vlevento)}</Field>
                  <Field label="Valor liquidado">{brlFull(row.valor_liquidado)}</Field>
                  <Field label="Valor pago">{brlFull(row.valor_pago)}</Field>
                  <Field label="Empenho total">{brlFull(row.empenho_total)}</Field>
                  <Field label="Saldo de empenho">
                    <span className={row.saldo_insuficiente ? 'text-red-600 font-semibold' : ''}>
                      {brlFull(row.saldo_empenho)}
                      {row.saldo_insuficiente && ' ⚠ Insuficiente'}
                    </span>
                  </Field>
                  <Field label="Valor executado">{brlFull(row.valor_executado)}</Field>
                </dl>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                  Datas
                </p>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <Field label="Data da medição">{fmtDate(row.dt_medicao)}</Field>
                  <Field label="Aprovação">{fmtDate(row.dt_aprovacao)}</Field>
                  <Field label="Envio SEI">{fmtDate(row.dt_envio_sei)}</Field>
                  <Field label="Última liquidação">{fmtDate(row.dt_ultima_liq)}</Field>
                  <Field label="Último pagamento">{fmtDate(row.dt_ultimo_pgto)}</Field>
                  <Field label="Fim do contrato">{fmtDate(row.dt_fim)}</Field>
                </dl>
              </div>
            </div>
          )}

          {/* ── Assinaturas ── */}
          {tab === 'assinaturas' && (
            <div>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="text-gray-400 animate-spin" />
                </div>
              ) : validAssinaturas.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-gray-400">
                    Nenhuma assinatura encontrada para esta medição.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full font-semibold">
                      <CheckCircle2 size={14} />
                      {assinados.length} assinado{assinados.length !== 1 ? 's' : ''}
                    </span>
                    {pendentes.length > 0 && (
                      <span className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full font-semibold">
                        <Clock size={14} />
                        {pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Papel
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Fiscal
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Situação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {validAssinaturas.map((a: MedicaoAssinatura, i: number) => {
                          const assinado = a.nmsituacao === 'ASSINADO'
                          return (
                            <tr key={i} className={assinado ? '' : 'bg-amber-50/40 dark:bg-amber-900/10'}>
                              <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                {a.nmpapel ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                                {a.nmfiscal ?? '—'}
                              </td>
                              <td className="px-4 py-3">
                                {assinado ? (
                                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                                    <CheckCircle2 size={13} /> Assinado
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                                    <Clock size={13} /> Pendente
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal de drill-down do funil ──────────────────────────────────────────────

function DrillModal({
  expectedStage,
  rows,
  onClose,
  onRowClick,
}: {
  expectedStage: string
  rows: FluxoRow[]
  onClose: () => void
  onRowClick?: (row: FluxoRow) => void
}) {
  const expectedIdx = ETAPAS_ORDER.indexOf(expectedStage)

  const sortedGroups = useMemo(() => {
    const groups: Record<string, FluxoRow[]> = {}
    for (const r of rows) {
      if (!groups[r.etapa_jornada]) groups[r.etapa_jornada] = []
      groups[r.etapa_jornada].push(r)
    }
    return Object.entries(groups).sort(
      (a, b) => ETAPAS_ORDER.indexOf(a[0]) - ETAPAS_ORDER.indexOf(b[0])
    )
  }, [rows])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-base font-bold text-gray-900 dark:text-gray-100">
              Esperado:{' '}
              <span style={{ color: ETAPA_COLORS[expectedStage] ?? '#6B7280' }}>
                {expectedStage}
              </span>
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {rows.length} {rows.length !== 1 ? 'medições' : 'medição'} · clique em uma linha para
              ver detalhes
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {sortedGroups.map(([etapa, etapaRows]) => {
            const idx = ETAPAS_ORDER.indexOf(etapa)
            const status =
              idx < expectedIdx ? 'atrasada' : idx === expectedIdx ? 'no-prazo' : 'adiantada'
            const [statusLabel, statusClass] =
              status === 'atrasada'
                ? ['Atrasada', 'bg-red-50 text-red-700 border-red-200']
                : status === 'adiantada'
                  ? ['Adiantada', 'bg-blue-50 text-blue-700 border-blue-200']
                  : ['No prazo', 'bg-emerald-50 text-emerald-700 border-emerald-200']

            return (
              <div key={etapa}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {etapaBadge(etapa)}
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusClass}`}
                  >
                    {statusLabel}
                  </span>
                  <span className="text-xs text-gray-400">
                    {etapaRows.length} {etapaRows.length !== 1 ? 'medições' : 'medição'}
                  </span>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Empresa
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Contrato
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Comp.
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {etapaRows.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                          onClick={() => {
                            onRowClick?.(r)
                            onClose()
                          }}
                        >
                          <td className="px-3 py-2 max-w-[160px]">
                            <span
                              className="block truncate font-medium text-gray-800 dark:text-gray-200"
                              title={r.empresa}
                            >
                              {r.empresa || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {r.contrato} <span className="text-gray-400 dark:text-gray-500">#{r.num_medicao}</span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.mes_ano}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {brl(r.vlevento)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Jornada Completa ──────────────────────────────────────────────────────────

function FunilCompleto({
  data,
  activeEtapa,
  onEtapaClick,
  onRowClick,
}: {
  data: FluxoRow[]
  activeEtapa: string | null
  onEtapaClick: (etapa: string | null) => void
  onRowClick?: (row: FluxoRow) => void
}) {
  const { data: cronogramaRaw = {} } = useQuery({
    queryKey: ['cronograma'],
    queryFn: () => cronogramaApi.getAll().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const funil = useMemo(() => {
    const total = data.length || 1
    return ETAPAS_ORDER.map((etapa) => {
      const etapaRows = data.filter((r) => r.etapa_jornada === etapa)
      return {
        etapa,
        quantidade: etapaRows.length,
        valor: etapaRows.reduce((s, r) => s + r.vlevento, 0),
        percentual: Math.round((etapaRows.length / total) * 100),
      }
    })
  }, [data])

  const { expectedByStage, rowsByExpectedStage } = useMemo(() => {
    const expectedByStage: Record<string, number> = {}
    const rowsByExpectedStage: Record<string, FluxoRow[]> = {}
    const byComp: Record<string, FluxoRow[]> = {}
    for (const r of data) {
      if (!r.mes_ano) continue
      if (!byComp[r.mes_ano]) byComp[r.mes_ano] = []
      byComp[r.mes_ano].push(r)
    }
    for (const [compStr, compRows] of Object.entries(byComp)) {
      const parsed = parseMesAno(compStr)
      if (!parsed) continue
      const mk = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`
      const rawConfig = cronogramaRaw[mk] ?? {}
      const config: Record<number, string> = Object.fromEntries(
        Object.entries(rawConfig).map(([k, v]) => [Number(k), v])
      )
      const { stage } = expectedStageToday(parsed.year, parsed.month, config)
      if (stage) {
        expectedByStage[stage] = (expectedByStage[stage] ?? 0) + compRows.length
        rowsByExpectedStage[stage] = [...(rowsByExpectedStage[stage] ?? []), ...compRows]
      }
    }
    return { expectedByStage, rowsByExpectedStage }
  }, [data, cronogramaRaw])

  const hasCronograma = Object.keys(expectedByStage).length > 0
  const [drillStage, setDrillStage] = useState<string | null>(null)

  return (
    <>
      {drillStage && (
        <DrillModal
          expectedStage={drillStage}
          rows={rowsByExpectedStage[drillStage] ?? []}
          onClose={() => setDrillStage(null)}
          onRowClick={onRowClick}
        />
      )}
      <div className="flex items-stretch gap-2 overflow-x-auto pb-2 pt-1">
        {funil.map((item, i) => {
          const color = ETAPA_COLORS[item.etapa] ?? '#9CA3AF'
          const isActive = activeEtapa === item.etapa
          const expected = hasCronograma ? (expectedByStage[item.etapa] ?? 0) : undefined
          const diff = expected !== undefined ? item.quantidade - expected : null

          return (
            <div key={item.etapa} className="flex items-center gap-2 flex-1 min-w-[148px]">
              <button
                onClick={() => onEtapaClick(isActive ? null : item.etapa)}
                className="flex-1 h-full rounded-2xl p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5"
                style={{
                  border: `2px solid ${isActive ? color : color + '30'}`,
                  backgroundColor: isActive ? color + '12' : color + '07',
                }}
              >
                {/* Indicador da etapa + alerta */}
                <div className="flex items-center mb-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                </div>

                {/* Contador principal */}
                <div className="text-[28px] font-bold text-gray-900 dark:text-gray-100 leading-none tabular-nums">
                  {fmtNum(item.quantidade)}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {item.quantidade === 1 ? 'medição' : 'medições'} &middot; {item.percentual}%
                </div>

                {/* Nome da etapa */}
                <div className="text-sm font-semibold mt-3 leading-snug" style={{ color }}>
                  {item.etapa}
                </div>

                {/* Valor financeiro */}
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{brl(item.valor)}</div>

                {/* Comparação com cronograma */}
                {expected !== undefined && (
                  <div className="mt-3 pt-2.5 border-t" style={{ borderColor: color + '25' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">Esperado</span>
                      <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 tabular-nums">
                        {fmtNum(expected)}
                      </span>
                    </div>
                    {diff !== null && diff !== 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDrillStage(item.etapa)
                        }}
                        className={`text-[11px] font-semibold mt-0.5 leading-tight underline decoration-dotted text-left w-full ${(() => {
                          const isGood = item.etapa === 'Paga integralmente' ? diff > 0 : diff < 0
                          return isGood
                            ? 'text-emerald-600 hover:text-emerald-800'
                            : 'text-amber-600 hover:text-amber-800'
                        })()}`}
                      >
                        {diff > 0
                          ? `${diff} a mais que o esperado`
                          : `${Math.abs(diff)} a menos que o esperado`}
                      </button>
                    )}
                    {diff === 0 && (
                      <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                        No cronograma
                      </p>
                    )}
                  </div>
                )}
              </button>

              {i < funil.length - 1 && (
                <ArrowRight size={14} className="flex-shrink-0 text-gray-300" />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Modal contratos vencendo ──────────────────────────────────────────────────

type ContratoVencendo = {
  contrato: string
  empresa: string
  rodovias: string
  vencimento: Date
  diasRestantes: number
}

function ContratosVencendoModal({
  contratos,
  onClose,
}: {
  contratos: ContratoVencendo[]
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <Calendar size={16} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                Contratos vencendo nos próximos 60 dias
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {contratos.length} contrato{contratos.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contrato
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Empresa
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rodovia
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  Vencimento
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Dias
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {contratos.map((c) => {
                const urgente = c.diasRestantes <= 15
                const atencao = c.diasRestantes <= 30
                return (
                  <tr key={c.contrato} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {c.contrato}
                    </td>
                    <td
                      className="px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 max-w-[200px] truncate"
                      title={c.empresa}
                    >
                      {c.empresa}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {c.rodovias || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {c.vencimento.toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${urgente ? 'bg-red-100 text-red-700' : atencao ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {c.diasRestantes}d
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Alertas ───────────────────────────────────────────────────────────────────

const ETAPAS_PAGAS = new Set(['Paga parcialmente', 'Paga integralmente'])

function AlertasPanel({
  data,
  allData,
  onFiltrarEtapa,
}: {
  data: FluxoRow[]
  allData: FluxoRow[]
  onFiltrarEtapa: (e: string) => void
}) {
  const [showVencendoModal, setShowVencendoModal] = useState(false)

  const saldoInsuficiente = useMemo(() => {
    const seen = new Set<string>()
    const contratos: FluxoRow[] = []
    for (const r of allData) {
      if (!seen.has(r.contrato)) {
        seen.add(r.contrato)
        contratos.push(r)
      }
    }
    const rows = contratos.filter((r) => r.saldo_insuficiente)
    return { quantidade: rows.length, saldo_total: rows.reduce((s, r) => s + r.saldo_empenho, 0) }
  }, [allData])

  const contratosVencendo = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const limite = new Date(hoje)
    limite.setDate(hoje.getDate() + 60)
    const seen = new Set<string>()
    const lista: ContratoVencendo[] = []
    for (const r of allData) {
      if (!r.dt_fim_execucao || seen.has(r.contrato)) continue
      seen.add(r.contrato)
      const dt = new Date(r.dt_fim_execucao)
      if (dt >= hoje && dt <= limite) {
        const diasRestantes = Math.ceil((dt.getTime() - hoje.getTime()) / 86_400_000)
        lista.push({
          contrato: r.contrato,
          empresa: r.empresa,
          rodovias: r.rodovias,
          vencimento: dt,
          diasRestantes,
        })
      }
    }
    lista.sort((a, b) => a.diasRestantes - b.diasRestantes)
    return lista
  }, [allData])

  const gargalo = useMemo(() => {
    let best: { etapa: string; quantidade: number; valor: number } | null = null
    for (const etapa of ETAPAS_CRITICAS) {
      const rows = data.filter((r) => r.etapa_jornada === etapa)
      const valor = rows.reduce((s, r) => s + r.vlevento, 0)
      if (!best || valor > best.valor) best = { etapa, quantidade: rows.length, valor }
    }
    return best?.valor ? best : null
  }, [data])

  return (
    <>
      {showVencendoModal && (
        <ContratosVencendoModal
          contratos={contratosVencendo}
          onClose={() => setShowVencendoModal(false)}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className={`card border-l-4 ${saldoInsuficiente.quantidade > 0 ? 'border-l-amber-500' : 'border-l-gray-200'}`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg flex-shrink-0 ${saldoInsuficiente.quantidade > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}
            >
              <AlertTriangle
                size={16}
                className={saldoInsuficiente.quantidade > 0 ? 'text-amber-600' : 'text-gray-400'}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Saldo Insuf. de Empenho
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight mt-0.5">
                {fmtNum(saldoInsuficiente.quantidade)}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1.5">contratos</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Saldo disponível: {brl(saldoInsuficiente.saldo_total)}
              </p>
              <p className="text-xs text-amber-600 font-semibold mt-1">
                Saldo {'<'} última medição
              </p>
            </div>
          </div>
          {saldoInsuficiente.quantidade > 0 && (
            <button
              onClick={() => onFiltrarEtapa('SALDO_INSUFICIENTE')}
              className="mt-3 w-full text-xs font-semibold text-amber-600 hover:text-amber-800 text-center py-1.5 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
            >
              Ver medições
            </button>
          )}
        </div>

        <div
          className={`card border-l-4 ${contratosVencendo.length > 0 ? 'border-l-red-500' : 'border-l-gray-200'}`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg flex-shrink-0 ${contratosVencendo.length > 0 ? 'bg-red-100' : 'bg-gray-100'}`}
            >
              <Calendar
                size={16}
                className={contratosVencendo.length > 0 ? 'text-red-600' : 'text-gray-400'}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Vencem em 60 Dias
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight mt-0.5">
                {fmtNum(contratosVencendo.length)}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1.5">contratos</span>
              </p>
              <p className="text-xs text-red-500 font-semibold mt-1">Prazo de execução próximo</p>
            </div>
          </div>
          {contratosVencendo.length > 0 && (
            <button
              onClick={() => setShowVencendoModal(true)}
              className="mt-3 w-full text-xs font-semibold text-red-600 hover:text-red-800 text-center py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              Ver contratos
            </button>
          )}
        </div>

        <div className={`card border-l-4 ${gargalo ? 'border-l-violet-500' : 'border-l-gray-200'}`}>
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg flex-shrink-0 ${gargalo ? 'bg-violet-100' : 'bg-gray-100'}`}
            >
              <TrendingDown size={16} className={gargalo ? 'text-violet-600' : 'text-gray-400'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Maior Gargalo
              </p>
              {gargalo ? (
                <>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight mt-0.5">
                    {fmtNum(gargalo.quantidade)}
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1.5">medições</span>
                  </p>
                  <p className="text-xs text-violet-600 font-semibold mt-0.5">{gargalo.etapa}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{brl(gargalo.valor)} represados</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 mt-2">Nenhum gargalo identificado</p>
              )}
            </div>
          </div>
          {gargalo && (
            <button
              onClick={() => onFiltrarEtapa(gargalo.etapa)}
              className="mt-3 w-full text-xs font-semibold text-violet-600 hover:text-violet-800 text-center py-1.5 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors"
            >
              Ver medições
            </button>
          )}
        </div>
      </div>
    </>
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
    jan: 1,
    feb: 2,
    mar: 3,
    abr: 4,
    mai: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    set: 9,
    out: 10,
    nov: 11,
    dez: 12,
  }

  const monthNumber = Number(rawMonth)
  const parsedMonth =
    Number.isFinite(monthNumber) && monthNumber >= 1 && monthNumber <= 12
      ? monthNumber
      : (monthNames[String(rawMonth).toLowerCase().slice(0, 3)] ?? null)

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

function dimBarOption(
  items: DimItem[],
  color: string,
  activeValue?: string[],
  isDark?: boolean
): Record<string, unknown> {
  const top = items.slice(0, 12)
  const labels = top.map((d) => d.label)
  const values = top.map((d) => d.valor)
  const qtds = top.map((d) => d.quantidade)
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: { name: string; value: number; dataIndex: number }[]) => {
        const p = params[0]
        return `<b>${p.name}</b><br/>Valor: <b>${brl(p.value)}</b><br/>Medições: <b>${qtds[p.dataIndex]}</b>`
      },
    },
    grid: { left: '3%', right: '14%', bottom: '3%', top: 4, containLabel: true },
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: {
      type: 'category',
      data: [...labels].reverse(),
      axisLabel: { fontSize: 11, width: 130, overflow: 'truncate', color: isDark ? '#9ca3af' : '#374151' },
    },
    series: [
      {
        type: 'bar',
        data: [...values].reverse(),
        barMaxWidth: 22,
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color:
            activeValue && activeValue.length > 0
              ? (params: { dataIndex: number }) => {
                  const lbl = [...labels].reverse()[params.dataIndex] ?? ''
                  return activeValue.some((v) => lbl.toUpperCase().includes(v.toUpperCase()))
                    ? color
                    : color + '40'
                }
              : color,
        },
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          formatter: (p: { value: number }) => brl(p.value),
          color: isDark ? '#d1d5db' : '#374151',
          textBorderColor: 'transparent',
          textBorderWidth: 0,
        },
      },
    ],
  }
}

function dimColumnOption(items: DimItem[], isDark?: boolean): Record<string, unknown> {
  const top = items.slice(0, 18)
  const data = top.map((item) => ({
    value: item.valor,
    name: item.label,
    quantidade: item.quantidade,
    itemStyle: {
      color: isCompetenciaAtrasada(item.rawLabel ?? item.label) ? '#ef4444' : '#22c55e',
      borderRadius: [4, 4, 0, 0],
    },
  }))

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: { name: string; value: number; data: { quantidade?: number } }[]) => {
        const p = params[0]
        return `<b>${p.name}</b><br/>Valor: <b>${brl(Number(p.value))}</b><br/>Medições: <b>${p.data.quantidade ?? 0}</b>`
      },
    },
    grid: { left: '3%', right: '4%', bottom: '26%', top: 6, containLabel: true },
    xAxis: {
      type: 'category',
      data: top.map((item) => item.label),
      axisLabel: { fontSize: 10, interval: 0, rotate: 45, hideOverlap: true, color: isDark ? '#9ca3af' : '#374151' },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: isDark ? '#374151' : '#E5E7EB' } },
    },
    series: [
      {
        type: 'bar',
        data,
        barWidth: '52%',
        label: {
          show: true,
          position: 'top',
          fontSize: 10,
          formatter: (p: { value: number }) => brl(Number(p.value)),
          color: isDark ? '#d1d5db' : '#374151',
          textBorderColor: 'transparent',
          textBorderWidth: 0,
        },
      },
    ],
  }
}

function DimChart({
  title,
  items,
  color,
  icon,
  loading,
  onBarClick,
  activeValue,
  chartType = 'bar',
}: {
  title: string
  items: DimItem[]
  color: string
  icon: ReactNode
  loading?: boolean
  onBarClick?: (v: string) => void
  activeValue?: string[]
  chartType?: 'bar' | 'column'
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const height = Math.max(160, Math.min(items.length, 12) * 26 + 50)
  const option = useMemo(
    () =>
      chartType === 'column'
        ? dimColumnOption(items, isDark)
        : dimBarOption(items, color, activeValue, isDark),
    [chartType, items, color, activeValue, isDark]
  )
  const events = useMemo(
    () =>
      onBarClick ? { click: (p: unknown) => onBarClick((p as { name: string }).name) } : undefined,
    [onBarClick]
  )

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: color + '18', color }}>
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        </div>
        {activeValue && activeValue.length > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500 italic truncate max-w-[140px]">
            {activeValue.length === 1
              ? `filtro: ${activeValue[0]}`
              : `${activeValue.length} filtros`}
          </span>
        )}
      </div>
      {loading ? (
        <div className="skeleton" style={{ height }} />
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Sem dados</p>
      ) : (
        <EChart
          option={option}
          height={chartType === 'column' ? 260 : height}
          onEvents={events}
          className={onBarClick ? 'cursor-pointer' : ''}
        />
      )}
    </div>
  )
}

// ── Tabela ────────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null
type SortKey = 'empresa' | 'mes_ano' | 'vlevento' | 'dias_na_etapa'
const PAGE_SIZE = 20

function rowHighlight(row: FluxoRow): string {
  const isCritical = ETAPAS_CRITICAS.has(row.etapa_jornada)
  if (isCritical && row.dias_na_etapa >= 30)
    return 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
  if (isCritical && row.dias_na_etapa >= 15)
    return 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'
  return 'hover:bg-gray-50 dark:hover:bg-gray-700'
}

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey | null; dir: SortDir } }) {
  if (sort.key !== col) return <ChevronsUpDown size={12} className="text-gray-300 ml-0.5" />
  if (sort.dir === 'asc') return <ChevronUp size={12} className="text-blue-500 ml-0.5" />
  return <ChevronDown size={12} className="text-blue-500 ml-0.5" />
}

function FluxoTable({
  data,
  localSearch,
  onLocalSearch,
  onRowClick,
}: {
  data: FluxoRow[]
  localSearch: string
  onLocalSearch: (v: string) => void
  onRowClick?: (row: FluxoRow) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: null })
  const [page, setPage] = useState(1)

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key !== key
        ? { key, dir: 'desc' }
        : prev.dir === 'desc'
          ? { key, dir: 'asc' }
          : { key: null, dir: null }
    )
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = localSearch.trim().toUpperCase()
    if (!q) return data
    return data.filter(
      (r) =>
        r.empresa.toUpperCase().includes(q) ||
        r.contrato.toUpperCase().includes(q) ||
        r.rodovias.toUpperCase().includes(q)
    )
  }, [data, localSearch])

  const sorted = useMemo(() => {
    if (!sort.key || !sort.dir) {
      return [...filtered].sort((a, b) => {
        const aCrit = ETAPAS_CRITICAS.has(a.etapa_jornada)
        const bCrit = ETAPAS_CRITICAS.has(b.etapa_jornada)
        if (aCrit !== bCrit) return aCrit ? -1 : 1
        return b.dias_na_etapa - a.dias_na_etapa
      })
    }
    return [...filtered].sort((a, b) => {
      const av = a[sort.key!] as string | number
      const bv = b[sort.key!] as string | number
      const cmp =
        typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function ColHeader({ label, col }: { label: string; col: SortKey }) {
    return (
      <th
        className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none whitespace-nowrap"
        onClick={() => toggleSort(col)}
      >
        <span className="flex items-center gap-0.5">
          {label}
          <SortIcon col={col} sort={sort} />
        </span>
      </th>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => {
              onLocalSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Filtrar por empresa, contrato ou rodovia..."
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-400 bg-white dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-500"
          />
          {localSearch && (
            <button
              onClick={() => {
                onLocalSearch('')
                setPage(1)
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {fmtNum(sorted.length)} medições
          {sorted.length !== data.length && ` (de ${fmtNum(data.length)})`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <ColHeader label="Empresa" col="empresa" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Rodovia
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Contrato / Med.
              </th>
              <ColHeader label="Competência" col="mes_ano" />
              <ColHeader label="Valor" col="vlevento" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Etapa
              </th>
              <ColHeader label="Dias" col="dias_na_etapa" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-400">
                  Nenhuma medição encontrada
                </td>
              </tr>
            ) : (
              pageData.map((row) => (
                <tr
                  key={row.id}
                  className={`transition-colors ${rowHighlight(row)} ${onRowClick ? 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-blue-200' : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  <td className="px-3 py-2.5 max-w-[180px]">
                    <span
                      className="block truncate text-sm font-medium text-gray-800 dark:text-gray-200"
                      title={row.empresa}
                    >
                      {row.empresa || '—'}
                    </span>
                    {row.tipo_contrato && (
                      <span className="text-xs text-gray-400">{row.tipo_contrato}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {row.rodovias || '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {row.contrato}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">#{row.num_medicao}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {row.mes_ano || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap text-right">
                    {brlFull(row.vlevento)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{etapaBadge(row.etapa_jornada)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {diasBadge(row.etapa_jornada, row.dias_na_etapa)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-gray-400">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 transition-colors"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Filtros ───────────────────────────────────────────────────────────────────

function FilterBar({
  empresa,
  onEmpresa,
  rodovia,
  onRodovia,
  natureza,
  onNatureza,
  municipio,
  onMunicipio,
  contrato,
  onContrato,
  competenciaDe,
  onCompetenciaDe,
  competenciaAte,
  onCompetenciaAte,
  empresasOpts,
  rodoviaOpts,
  naturezaOpts,
  municipioOpts,
  contratoOpts,
  onLimpar,
  activeCount,
  onHelp,
}: {
  empresa: string[]
  onEmpresa: (v: string[]) => void
  rodovia: string[]
  onRodovia: (v: string[]) => void
  natureza: string[]
  onNatureza: (v: string[]) => void
  municipio: string[]
  onMunicipio: (v: string[]) => void
  contrato: string[]
  onContrato: (v: string[]) => void
  competenciaDe: string
  onCompetenciaDe: (v: string) => void
  competenciaAte: string
  onCompetenciaAte: (v: string) => void
  empresasOpts: string[]
  rodoviaOpts: string[]
  naturezaOpts: string[]
  municipioOpts: string[]
  contratoOpts: string[]
  onLimpar: () => void
  activeCount: number
  onHelp: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="card">
      {/* Mobile: botão toggle */}
      <div className="flex items-center justify-between md:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <SlidersHorizontal size={15} className="text-gray-500" />
          Filtros
          {activeCount > 0 && (
            <span className="bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ml-0.5">
              {activeCount}
            </span>
          )}
          {open ? (
            <ChevronUp size={14} className="text-gray-400 ml-1" />
          ) : (
            <ChevronDown size={14} className="text-gray-400 ml-1" />
          )}
        </button>
        {activeCount > 0 && (
          <button
            onClick={onLimpar}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <X size={12} />
            Limpar
          </button>
        )}
      </div>

      {/* Campos de filtro: coluna no mobile, linha no desktop */}
      <div
        className={`flex-col md:flex-row md:items-center gap-3 md:gap-4 md:flex-wrap ${open ? 'flex mt-4 md:mt-0' : 'hidden md:flex'}`}
      >
        <div className="w-full md:w-64">
          <ComboBox
            multiple
            label="Empresa"
            value={empresa}
            options={empresasOpts}
            onChange={onEmpresa}
            allLabel="Todas as empresas"
          />
        </div>
        <div className="w-full md:w-44">
          <ComboBox
            multiple
            label="Contrato"
            value={contrato}
            options={contratoOpts}
            onChange={onContrato}
            allLabel="Todos"
          />
        </div>
        <div className="w-full md:w-44">
          <ComboBox
            multiple
            label="Rodovia"
            value={rodovia}
            options={rodoviaOpts}
            onChange={onRodovia}
            allLabel="Todas"
          />
        </div>
        <div className="w-full md:w-44">
          <ComboBox
            multiple
            label="Município"
            value={municipio}
            options={municipioOpts}
            onChange={onMunicipio}
            allLabel="Todos"
          />
        </div>
        <div className="w-full md:w-44">
          <ComboBox
            multiple
            label="Natureza"
            value={natureza}
            options={naturezaOpts}
            onChange={onNatureza}
            allLabel="Todas"
          />
        </div>
        <div className="flex gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
              Competência de
            </p>
            <MonthPicker value={competenciaDe} onChange={onCompetenciaDe} placeholder="Início" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Até
            </p>
            <MonthPicker value={competenciaAte} onChange={onCompetenciaAte} placeholder="Fim" />
          </div>
        </div>
        <div className="md:ml-auto flex items-center gap-3 pt-0 md:pt-6 flex-wrap">
          {activeCount > 0 && (
            <button
              onClick={onLimpar}
              className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={12} />
              Limpar filtros
              <span className="bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {activeCount}
              </span>
            </button>
          )}
          <button
            onClick={onHelp}
            title="Ajuda sobre esta tela"
            className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 transition-colors"
          >
            <HelpCircle size={13} />
            Ajuda
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de ajuda ────────────────────────────────────────────────────────────

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 rounded-t-2xl z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <HelpCircle size={16} className="text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              Rastreio de Pagamentos — Guia da tela
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-6 text-sm text-gray-600 dark:text-gray-400">
          <p className="text-gray-500 leading-relaxed">
            Esta tela acompanha o ciclo financeiro de cada medição — desde a aprovação pelo DER-PE
            até o pagamento à empresa contratada. Use os filtros para focar em empresa, rodovia ou
            período, e clique nos cards e no funil para filtrar a tabela de rastreio.
          </p>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Indicadores (KPIs)
            </h3>
            <div className="space-y-3">
              {[
                {
                  color: 'bg-blue-500',
                  title: 'Em Aberto',
                  desc: 'Total de medições que ainda não foram pagas integralmente, independente da etapa. Representa toda a exposição financeira atual no fluxo de pagamentos.',
                },
                {
                  color: 'bg-teal-500',
                  title: 'Aguardando Pagamento',
                  desc: 'Medições já liquidadas — empenho processado, nota aceita — mas ainda sem pagamento efetivo transferido. Ação esperada: área financeira libera o pagamento.',
                },
                {
                  color: 'bg-orange-500',
                  title: 'Aguardando Nota',
                  desc: 'Medições aprovadas e com todas as assinaturas concluídas, mas sem nota fiscal emitida pela empresa. Ação esperada: empresa emite a nota no sistema.',
                },
                {
                  color: 'bg-red-500',
                  title: 'Alertas Críticos',
                  desc: 'Medições em etapas financeiras sensíveis (Ag. Nota, Nota Emitida, Liquidada ou Paga Parcialmente) sem nenhuma movimentação há mais de 30 dias. São os casos que mais exigem atenção imediata.',
                },
              ].map(({ color, title, desc }) => (
                <div key={title} className="flex gap-3">
                  <span className={`mt-0.5 w-2 h-2 rounded-full ${color} flex-shrink-0`} />
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">{title}</p>
                    <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Jornada Completa das Medições
            </h3>
            <p className="text-gray-500 leading-relaxed mb-2">
              Mostra quantas medições estão em cada etapa do ciclo financeiro. As etapas são, em
              ordem:
            </p>
            <ol className="space-y-1.5 pl-1">
              {[
                ['Criada', 'Medição aberta, sem valor lançado ainda.'],
                ['Iniciada', 'Valor lançado, aguardando aprovação formal.'],
                [
                  'Assinatura pendente',
                  'Aprovada pelo sistema, mas faltam assinaturas digitais dos fiscais.',
                ],
                ['Ag. Nota', 'Todas as assinaturas concluídas. Empresa deve emitir a nota fiscal.'],
                [
                  'Nota Emitida',
                  'Nota fiscal recebida. Aguardando liquidação (empenho) pelo DER-PE.',
                ],
                ['Liquidada', 'Empenho realizado. Aguardando pagamento financeiro.'],
                ['Paga Parc.', 'Parte do valor foi paga. Saldo remanescente em aberto.'],
                ['Paga Integr.', 'Pagamento 100% concluído. Medição encerrada.'],
              ].map(([etapa, desc]) => (
                <li key={etapa} className="flex gap-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{etapa}:</span>
                  <span className="text-gray-500 dark:text-gray-400">{desc}</span>
                </li>
              ))}
            </ol>
            <p className="text-gray-400 mt-2 text-xs">
              Clique em qualquer etapa para filtrar a tabela de rastreio abaixo.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Atenção Imediata
            </h3>
            <div className="space-y-2.5">
              <div>
                <p className="font-semibold text-gray-700">Saldo Insuficiente de Empenho</p>
                <p className="text-gray-500 leading-relaxed">
                  Contratos onde o saldo de empenho (total empenhado menos total liquidado) é menor
                  que o valor da última medição aprovada. Indica risco de não conseguir empenhar a
                  próxima medição de mesma magnitude.
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-700">
                  Contratos com Vencimento nos Próximos 60 Dias
                </p>
                <p className="text-gray-500 leading-relaxed">
                  Contratos cujo prazo de execução vence nos próximos 60 dias. Contratos vencidos
                  não podem receber novas medições — atenção para emissão de aditivos ou
                  encerramento dentro do prazo.
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-700">Maior Gargalo</p>
                <p className="text-gray-500 leading-relaxed">
                  A etapa financeira com maior valor total represado entre todas as etapas críticas.
                  Indica onde concentrar energia para destravar o maior volume de recursos.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Tabela de Rastreio
            </h3>
            <p className="text-gray-500 leading-relaxed mb-2">
              Lista detalhada de todas as medições, ordenada por urgência:
            </p>
            <ul className="space-y-1 pl-1 text-gray-500">
              <li>
                · Linhas <span className="text-red-600 font-semibold">vermelhas</span> = etapa
                crítica há mais de 30 dias
              </li>
              <li>
                · Linhas <span className="text-amber-600 font-semibold">amarelas</span> = etapa
                crítica há 15–30 dias
              </li>
              <li>
                · A coluna <span className="font-semibold text-gray-700">Dias</span> indica há
                quantos dias a medição está parada na etapa atual
              </li>
              <li>· Use a busca rápida para filtrar por empresa, contrato ou rodovia</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Aderência ao Cronograma ───────────────────────────────────────────────────

function AderenciaCronograma({ rows }: { rows: FluxoRow[] }) {
  const { data: cronogramaRaw = {} } = useQuery({
    queryKey: ['cronograma'],
    queryFn: () => cronogramaApi.getAll().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const stats = useMemo(() => {
    // Agrupar por competência
    const byComp: Record<string, FluxoRow[]> = {}
    for (const r of rows) {
      if (!r.mes_ano) continue
      if (!byComp[r.mes_ano]) byComp[r.mes_ano] = []
      byComp[r.mes_ano].push(r)
    }

    return Object.entries(byComp)
      .map(([compStr, compRows]) => {
        const parsed = parseMesAno(compStr)
        if (!parsed) return null

        const mk = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`
        const rawConfig = cronogramaRaw[mk] ?? {}
        const config: Record<number, string> = Object.fromEntries(
          Object.entries(rawConfig).map(([k, v]) => [Number(k), v])
        )

        const { stage, status } = expectedStageToday(parsed.year, parsed.month, config)
        const total = compRows.length

        if (status === 'noconfig')
          return {
            compStr,
            total,
            hasConfig: false,
            stage: null,
            status,
            atrasadas: 0,
            noPrazo: 0,
            adiantadas: 0,
          }
        if (!stage)
          return {
            compStr,
            total,
            hasConfig: true,
            stage: null,
            status,
            atrasadas: 0,
            noPrazo: 0,
            adiantadas: 0,
          }

        const expectedIdx = ETAPAS_ORDER.indexOf(stage)
        let atrasadas = 0,
          noPrazo = 0,
          adiantadas = 0
        for (const r of compRows) {
          const ai = ETAPAS_ORDER.indexOf(r.etapa_jornada)
          if (ai < expectedIdx) atrasadas++
          else if (ai === expectedIdx) noPrazo++
          else adiantadas++
        }
        return { compStr, total, hasConfig: true, stage, status, atrasadas, noPrazo, adiantadas }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const [am, ay] = a!.compStr.split('/').map(Number)
        const [bm, by] = b!.compStr.split('/').map(Number)
        return by * 100 + bm - (ay * 100 + am)
      })
  }, [rows, cronogramaRaw])

  const semConfig = stats.filter((s) => !s?.hasConfig).length
  const totalComps = stats.length

  return (
    <div className="space-y-4">
      {semConfig > 0 && (
        <div className="card border-l-4 border-l-amber-400 flex items-center gap-3 flex-wrap">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-700">
              {semConfig} de {totalComps} competência(s) sem cronograma configurado
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Use a grade acima para configurar a etapa esperada por dia.
            </p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Aderência ao Cronograma</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Etapa esperada hoje vs etapa real de cada medição, por competência.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Competência
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Esperado hoje
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-red-500 uppercase tracking-wider">
                  Atrasadas
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-green-600 uppercase tracking-wider">
                  No prazo
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-blue-500 uppercase tracking-wider">
                  Adiantadas
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Aderência
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {stats.map((s) => {
                if (!s) return null
                const aderencia =
                  s.stage && s.total > 0
                    ? Math.round(((s.noPrazo + s.adiantadas) / s.total) * 100)
                    : null
                const stageColor = s.stage ? (ETAPA_COLORS[s.stage] ?? '#9CA3AF') : null

                return (
                  <tr key={s.compStr} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-xs whitespace-nowrap">
                      {s.compStr}
                    </td>
                    <td className="px-4 py-3">
                      {!s.hasConfig ? (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          Sem configuração
                        </span>
                      ) : s.status === 'before' ? (
                        <span className="text-xs text-gray-400 italic">Período não iniciado</span>
                      ) : !s.stage ? (
                        <span className="text-xs text-gray-400 italic">Dia não configurado</span>
                      ) : (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: stageColor! + '20', color: stageColor! }}
                        >
                          {s.stage}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 text-xs">
                      {fmtNum(s.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.atrasadas > 0 ? (
                        <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          {fmtNum(s.atrasadas)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.noPrazo > 0 ? (
                        <span className="text-xs font-semibold text-green-600">
                          {fmtNum(s.noPrazo)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.adiantadas > 0 ? (
                        <span className="text-xs font-semibold text-blue-500">
                          {fmtNum(s.adiantadas)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {aderencia !== null ? (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            aderencia >= 90
                              ? 'bg-green-50 text-green-700'
                              : aderencia >= 70
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {aderencia}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 space-y-0.5">
          <p>
            <span className="font-semibold text-gray-500 dark:text-gray-400">Esperado hoje:</span> etapa configurada no
            Cronograma para o dia atual no período da competência.
          </p>
          <p>
            <span className="font-semibold text-gray-500 dark:text-gray-400">Atrasada:</span> etapa real anterior à
            esperada. <span className="font-semibold text-gray-500 dark:text-gray-400">Adiantada:</span> etapa real
            posterior à esperada.
          </p>
          <p>
            <span className="font-semibold text-gray-500 dark:text-gray-400">Aderência:</span> (No prazo + Adiantadas)
            ÷ Total.
          </p>
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

  const [empresa, setEmpresa] = useState<string[]>([])
  const [rodovia, setRodovia] = useState<string[]>([])
  const [natureza, setNatureza] = useState<string[]>([])
  const [municipio, setMunicipio] = useState<string[]>([])
  const [contrato, setContrato] = useState<string[]>([])
  const [competenciaDe, setCompetenciaDe] = useState(defaultCompetenciaDe)
  const [competenciaAte, setCompetenciaAte] = useState(defaultCompetenciaAte)
  const [etapaFiltro, setEtapaFiltro] = useState<string | null>(null)
  const [distritoFiltro, setDistritoFiltro] = useState<string[]>([])
  const [localSearch, setLocalSearch] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [activePage, setActivePage] = useState<'resumo' | 'analitico' | 'rastreio' | 'cronograma'>(
    'resumo'
  )
  const [selectedRow, setSelectedRow] = useState<FluxoRow | null>(null)

  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (etapaFiltro && tableRef.current)
      tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [etapaFiltro])

  // Opções dos filtros
  const options = useMemo(
    () => ({
      empresas: [...new Set(rows.map((r) => r.empresa).filter(Boolean))].sort(),
      rodovias: [
        ...new Set(
          rows.flatMap((r) => (r.rodovias || '').split(',').map((s) => s.trim())).filter(Boolean)
        ),
      ].sort(),
      naturezas: [...new Set(rows.map((r) => r.natureza).filter(Boolean))].sort(),
      distritos: [...new Set(rows.map((r) => r.distrito).filter(Boolean))].sort(),
      municipios: [
        ...new Set(
          rows.flatMap((r) => (r.municipios || '').split(',').map((s) => s.trim())).filter(Boolean)
        ),
      ].sort(),
      contratos: [...new Set(rows.map((r) => r.contrato).filter(Boolean))].sort(),
    }),
    [rows]
  )

  // Filtros sem etapa (para funil e alertas)
  const filteredBase = useMemo(() => {
    return rows.filter((r) => {
      if (empresa.length > 0 && !empresa.includes(r.empresa)) return false
      if (contrato.length > 0 && !contrato.includes(r.contrato)) return false
      if (rodovia.length > 0) {
        const rowRodovias = (r.rodovias || '').split(',').map((v) => v.trim())
        if (
          !rodovia.some((v) =>
            v === '(sem info)' ? !rowRodovias.filter(Boolean).length : rowRodovias.includes(v)
          )
        )
          return false
      }
      if (natureza.length > 0 && !natureza.includes(r.natureza)) return false
      if (municipio.length > 0) {
        const rowMunicipios = (r.municipios || '').split(',').map((v) => v.trim())
        if (
          !municipio.some((v) =>
            v === '(sem info)' ? !rowMunicipios.filter(Boolean).length : rowMunicipios.includes(v)
          )
        )
          return false
      }
      if (distritoFiltro.length > 0 && !distritoFiltro.includes(r.distrito)) return false
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
  }, [
    rows,
    empresa,
    contrato,
    rodovia,
    natureza,
    municipio,
    distritoFiltro,
    competenciaDe,
    competenciaAte,
  ])

  // Com etapa (para tabela)
  const filtered = useMemo(() => {
    if (!etapaFiltro) return filteredBase
    if (etapaFiltro === 'EM_ABERTO')
      return filteredBase.filter((r) =>
        [
          'Assinatura pendente',
          'Finalizada - aguardando nota',
          'Nota emitida',
          'Liquidada',
          'Paga parcialmente',
        ].includes(r.etapa_jornada)
      )
    if (etapaFiltro === 'ALERTAS_CRITICOS')
      return filteredBase.filter(
        (r) => ETAPAS_CRITICAS.has(r.etapa_jornada) && r.dias_na_etapa >= 30
      )
    if (etapaFiltro === 'SALDO_INSUFICIENTE')
      return filteredBase.filter((r) => r.saldo_insuficiente && !ETAPAS_PAGAS.has(r.etapa_jornada))
    return filteredBase.filter((r) => r.etapa_jornada === etapaFiltro)
  }, [filteredBase, etapaFiltro])

  const activeFilterCount = [
    empresa.length > 0,
    contrato.length > 0,
    rodovia.length > 0,
    natureza.length > 0,
    municipio.length > 0,
    distritoFiltro.length > 0,
    competenciaDe !== defaultCompetenciaDe,
    competenciaAte !== defaultCompetenciaAte,
  ].filter(Boolean).length

  function limpar() {
    setEmpresa([])
    setContrato([])
    setRodovia([])
    setNatureza([])
    setMunicipio([])
    setCompetenciaDe(defaultCompetenciaDe)
    setCompetenciaAte(defaultCompetenciaAte)
    setEtapaFiltro(null)
    setDistritoFiltro([])
    setLocalSearch('')
  }

  // Dimensões (NaoPagas — etapas fechadas mas não pagas)
  const naoPagasRows = useMemo(
    () =>
      filteredBase.filter((r) =>
        [
          'Assinatura pendente',
          'Finalizada - aguardando nota',
          'Nota emitida',
          'Liquidada',
          'Paga parcialmente',
        ].includes(r.etapa_jornada)
      ),
    [filteredBase]
  )

  // KPIs
  const kpis = useMemo(() => {
    const emAberto = naoPagasRows
    const aguPgto = filteredBase.filter((r) => r.etapa_jornada === 'Liquidada')
    const aguNota = filteredBase.filter((r) => r.etapa_jornada === 'Finalizada - aguardando nota')
    const alertasCrit = filteredBase.filter(
      (r) => ETAPAS_CRITICAS.has(r.etapa_jornada) && r.dias_na_etapa >= 30
    )
    return {
      em_aberto: emAberto.length,
      valor_em_aberto: emAberto.reduce((s, r) => s + r.vlevento, 0),
      aguardando_pagamento: aguPgto.length,
      valor_aguardando_pgto: aguPgto.reduce((s, r) => s + r.vlevento, 0),
      aguardando_nota: aguNota.length,
      valor_aguardando_nota: aguNota.reduce((s, r) => s + r.vlevento, 0),
      alertas_criticos: alertasCrit.length,
      valor_alertas: alertasCrit.reduce((s, r) => s + r.vlevento, 0),
    }
  }, [filteredBase, naoPagasRows])

  function dimItems(key: (r: FluxoRow) => string): DimItem[] {
    const acc: Record<string, { valor: number; quantidade: number }> = {}
    for (const r of naoPagasRows) {
      const k = key(r) || '(sem info)'
      if (!acc[k]) acc[k] = { valor: 0, quantidade: 0 }
      acc[k].valor += r.vlevento
      acc[k].quantidade += 1
    }
    return Object.entries(acc)
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.valor - a.valor)
  }

  function dimItemsMultiValue(key: (r: FluxoRow) => string[]): DimItem[] {
    const acc: Record<string, { valor: number; quantidade: number }> = {}
    for (const r of naoPagasRows) {
      const values = key(r)
        .map((v) => v.trim())
        .filter(Boolean)
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
    return Object.entries(acc)
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.valor - a.valor)
  }

  const dimEmpresa = useMemo(() => dimItems((r) => r.empresa), [naoPagasRows]) // eslint-disable-line react-hooks/exhaustive-deps
  const dimRodovia = useMemo(
    () => dimItemsMultiValue((r) => (r.rodovias || '').split(',').map((v) => v.trim())),
    [naoPagasRows] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const dimMunicipio = useMemo(
    () =>
      dimItemsMultiValue((r) => (r.municipios || '').split(',').map((v) => v.trim())).filter(
        (d) => d.label !== '(sem info)'
      ),
    [naoPagasRows] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const dimSetor = useMemo(() => dimItems((r) => r.distrito), [naoPagasRows]) // eslint-disable-line react-hooks/exhaustive-deps
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
        label:
          item.rawLabel === '(sem competência)'
            ? '(sem competência)'
            : formatMonthYearLabel(item.rawLabel ?? item.label),
      }))
  }, [naoPagasRows])

  function formatMonthYearLabel(value: string) {
    const [month, year] = value.split('/')
    const monthNames = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]
    const monthIndex = Number(month) - 1
    return `${monthNames[monthIndex] ?? month}/${year}`
  }

  function handleDimClick(setter: (v: string[]) => void, current: string[], valor: string) {
    setter(current.includes(valor) ? current.filter((x) => x !== valor) : [...current, valor])
    setLocalSearch('')
    setActivePage('rastreio')
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  function handleCompetenciaClick(label: string) {
    const item = dimCompetencia.find((d) => d.label === label)
    const raw = item?.rawLabel
    if (!raw || raw === '(sem competência)') return
    const [mm, yyyy] = raw.split('/')
    if (!mm || !yyyy) return
    const key = `${yyyy}-${mm}`
    const isActive = competenciaDe === key && competenciaAte === key
    setCompetenciaDe(isActive ? defaultCompetenciaDe : key)
    setCompetenciaAte(isActive ? defaultCompetenciaAte : key)
    setLocalSearch('')
    setActivePage('rastreio')
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  function handleEtapa(etapa: string | null) {
    setEtapaFiltro(etapa)
    setLocalSearch('')
    setActivePage('rastreio')
  }
  function handleFiltrarEtapa(etapa: string) {
    setEtapaFiltro((prev) => (prev === etapa ? null : etapa))
    setLocalSearch('')
    setActivePage('rastreio')
  }

  const lookupEtapaLabel = (etapa: string | null) => {
    if (!etapa) return null
    if (etapa === 'EM_ABERTO') return 'Em Aberto'
    if (etapa === 'ALERTAS_CRITICOS') return 'Alertas Críticos'
    if (etapa === 'SALDO_INSUFICIENTE') return 'Saldo Insuficiente'
    if (etapa === 'VENCENDO_60_DIAS') return 'Contratos Vencendo (60d)'
    return etapa
  }

  return (
    <>
      <div className="space-y-5">
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

        {/* Filtros */}
        <FilterBar
          empresa={empresa}
          onEmpresa={setEmpresa}
          contrato={contrato}
          onContrato={setContrato}
          rodovia={rodovia}
          onRodovia={setRodovia}
          municipio={municipio}
          onMunicipio={setMunicipio}
          natureza={natureza}
          onNatureza={setNatureza}
          competenciaDe={competenciaDe}
          onCompetenciaDe={setCompetenciaDe}
          competenciaAte={competenciaAte}
          onCompetenciaAte={setCompetenciaAte}
          empresasOpts={options.empresas}
          contratoOpts={options.contratos}
          rodoviaOpts={options.rodovias}
          municipioOpts={options.municipios}
          naturezaOpts={options.naturezas}
          onLimpar={limpar}
          activeCount={activeFilterCount}
          onHelp={() => setShowHelp(true)}
        />

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1.5 inline-flex flex-wrap gap-1.5 w-full md:w-auto shadow-sm">
          {[
            { id: 'resumo', label: 'Resumo' },
            { id: 'analitico', label: 'Análise' },
            { id: 'rastreio', label: 'Rastreio' },
            { id: 'cronograma', label: 'Cronograma' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActivePage(tab.id as 'resumo' | 'analitico' | 'rastreio' | 'cronograma')
                setEtapaFiltro(null)
              }}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                activePage === tab.id
                  ? 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-400 shadow-sm ring-1 ring-blue-100 dark:ring-blue-900'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activePage === 'resumo' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                title="Em Aberto"
                value={fmtNum(kpis.em_aberto)}
                subtitle={`${brl(kpis.valor_em_aberto)} ainda não pago`}
                icon={<CircleAlert size={18} />}
                accent="blue"
                onClick={kpis.em_aberto ? () => handleFiltrarEtapa('EM_ABERTO') : undefined}
                tooltip="Medições já fechadas e que ainda não foram pagas."
              />
              <KpiCard
                title="Ag. Pagamento"
                value={fmtNum(kpis.aguardando_pagamento)}
                subtitle={`${brl(kpis.valor_aguardando_pgto)} liquidados`}
                icon={<Banknote size={18} />}
                accent="teal"
                onClick={
                  kpis.aguardando_pagamento ? () => handleFiltrarEtapa('Liquidada') : undefined
                }
                tooltip="Medições já liquidadas aguardando transferência do pagamento."
              />
              <KpiCard
                title="Ag. Nota Fiscal"
                value={fmtNum(kpis.aguardando_nota)}
                subtitle={`${brl(kpis.valor_aguardando_nota)} em aberto`}
                icon={<FileText size={18} />}
                accent="orange"
                onClick={
                  kpis.aguardando_nota
                    ? () => handleFiltrarEtapa('Finalizada - aguardando nota')
                    : undefined
                }
                tooltip="Medições aprovadas aguardando nota fiscal da empresa."
              />
              <KpiCard
                title="Alertas Críticos"
                value={fmtNum(kpis.alertas_criticos)}
                subtitle={`${brl(kpis.valor_alertas)} represados +30d`}
                icon={<AlertTriangle size={18} />}
                accent="red"
                onClick={
                  kpis.alertas_criticos ? () => handleFiltrarEtapa('ALERTAS_CRITICOS') : undefined
                }
                tooltip="Medições em etapas financeiras sem movimentação há mais de 30 dias."
              />
            </div>

            <div className="card">
              <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Jornada Completa das Medições
                  </h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Clique em uma etapa para filtrar a tabela
                    {etapaFiltro && (
                      <button
                        onClick={() => setEtapaFiltro(null)}
                        className="ml-2 text-blue-500 hover:text-blue-700 font-semibold"
                      >
                        · Limpar
                      </button>
                    )}
                  </p>
                </div>
                {etapaFiltro && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                    {lookupEtapaLabel(etapaFiltro)}
                  </span>
                )}
              </div>
              <FunilCompleto
                data={filteredBase}
                activeEtapa={etapaFiltro}
                onEtapaClick={handleEtapa}
                onRowClick={setSelectedRow}
              />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Atenção Imediata</h2>
              <AlertasPanel
                data={filteredBase}
                allData={rows}
                onFiltrarEtapa={handleFiltrarEtapa}
              />
            </div>
          </div>
        )}

        {activePage === 'analitico' && (
          <div className="card space-y-5">
            <div className="mb-4">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Medições em aberto</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Medições já fechadas e não pagas · clique nos gráficos para filtrar a tabela
              </p>
            </div>
            <div className="mt-0 mb-4">
              <DimChart
                title="Por Competência"
                items={dimCompetencia}
                color="#22c55e"
                icon={<BarChart3 size={14} />}
                chartType="column"
                onBarClick={handleCompetenciaClick}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DimChart
                title="Por Empresa"
                items={dimEmpresa}
                color="#F97316"
                icon={<Building2 size={14} />}
                onBarClick={(v) => handleDimClick(setEmpresa, empresa, v)}
                activeValue={empresa}
              />
              <DimChart
                title="Por Rodovia"
                items={dimRodovia}
                color="#10B981"
                icon={<BarChart3 size={14} />}
                onBarClick={(v) => handleDimClick(setRodovia, rodovia, v)}
                activeValue={rodovia}
              />
              <DimChart
                title="Por Município"
                items={dimMunicipio}
                color="#6366F1"
                icon={<BarChart3 size={14} />}
                onBarClick={(v) => handleDimClick(setMunicipio, municipio, v)}
                activeValue={municipio}
              />
              <DimChart
                title="Por Distrito"
                items={dimSetor}
                color="#8B5CF6"
                icon={<BarChart3 size={14} />}
                onBarClick={(v) => handleDimClick(setDistritoFiltro, distritoFiltro, v)}
                activeValue={distritoFiltro}
              />
            </div>
          </div>
        )}

        {activePage === 'cronograma' && (
          <div className="space-y-6">
            <Cronograma compact />
            <AderenciaCronograma rows={filteredBase} />
          </div>
        )}

        {activePage === 'rastreio' && (
          <div ref={tableRef} className="card">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Rastreio de Medições</h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    Crítico +30d
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    Atenção 15–30d
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {etapaFiltro && (
                  <button
                    onClick={() => setEtapaFiltro(null)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
                  >
                    <X size={11} />
                    {lookupEtapaLabel(etapaFiltro)}
                  </button>
                )}
                {distritoFiltro.length > 0 && (
                  <button
                    onClick={() => setDistritoFiltro([])}
                    className="flex items-center gap-1 text-xs text-emerald-600 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-50"
                  >
                    <X size={11} />
                    {distritoFiltro.length === 1
                      ? distritoFiltro[0]
                      : `${distritoFiltro.length} distritos`}
                  </button>
                )}
                {municipio.length > 0 && (
                  <button
                    onClick={() => setMunicipio([])}
                    className="flex items-center gap-1 text-xs text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50"
                  >
                    <X size={11} />
                    {municipio.length === 1 ? municipio[0] : `${municipio.length} municípios`}
                  </button>
                )}
              </div>
            </div>
            <FluxoTable
              data={filtered}
              localSearch={localSearch}
              onLocalSearch={setLocalSearch}
              onRowClick={setSelectedRow}
            />
          </div>
        )}
      </div>

      {selectedRow && <MedicaoModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </>
  )
}

export { FluxoMedicoes as Panel }
