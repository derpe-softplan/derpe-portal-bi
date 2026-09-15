import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Info, Loader2, Wand2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cronogramaApi } from '../../services/api'

// ── Etapas ────────────────────────────────────────────────────────────────────

const ETAPAS = [
  { key: 'Criada',                        color: '#9CA3AF' },
  { key: 'Iniciada',                       color: '#0EA5E9' },
  { key: 'Assinatura pendente',            color: '#F59E0B' },
  { key: 'Finalizada - aguardando nota',   color: '#F97316' },
  { key: 'Nota emitida',                   color: '#8B5CF6' },
  { key: 'Liquidada',                      color: '#06B6D4' },
  { key: 'Paga parcialmente',              color: '#84CC16' },
  { key: 'Paga integralmente',             color: '#16A34A' },
]

const ETAPA_COLOR: Record<string, string> = Object.fromEntries(ETAPAS.map(e => [e.key, e.color]))
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const DOW_ABBR = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const STAGE_SHORT: Record<string, string> = {
  'Criada':                       'Criada',
  'Iniciada':                     'Iniciada',
  'Assinatura pendente':          'Assin. Pend.',
  'Finalizada - aguardando nota': 'Ag. Nota',
  'Nota emitida':                 'Nota Emit.',
  'Liquidada':                    'Liquidada',
  'Paga parcialmente':            'Paga Parc.',
  'Paga integralmente':           'Paga Integr.',
}

// ── Utilitários de calendário ──────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

// ── Feriados ──────────────────────────────────────────────────────────────────

function computeEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const HOLIDAY_CACHE = new Map<number, Map<string, string>>()

function getHolidayMap(year: number): Map<string, string> {
  if (HOLIDAY_CACHE.has(year)) return HOLIDAY_CACHE.get(year)!
  const map = new Map<string, string>()
  const add = (month: number, day: number, name: string) => map.set(`${month}-${day}`, name)

  add(1,  1,  'Ano Novo')
  add(4,  21, 'Tiradentes')
  add(5,  1,  'Dia do Trabalho')
  add(9,  7,  'Independência')
  add(10, 12, 'N. Sra. Aparecida')
  add(11, 2,  'Finados')
  add(11, 15, 'Proclamação da República')
  if (year >= 2024) add(11, 20, 'Consciência Negra')
  add(12, 25, 'Natal')
  add(3,  6,  'Revolução Pernambucana')

  const easter = computeEaster(year)
  const addOffset = (offset: number, name: string) => {
    const dt = new Date(easter)
    dt.setDate(dt.getDate() + offset)
    add(dt.getMonth() + 1, dt.getDate(), name)
  }
  addOffset(-48, 'Carnaval')
  addOffset(-47, 'Carnaval')
  addOffset(-2,  'Sexta-feira Santa')
  addOffset(0,   'Páscoa')
  addOffset(60,  'Corpus Christi')

  HOLIDAY_CACHE.set(year, map)
  return map
}

// ── Modelo de preenchimento automático ────────────────────────────────────────

type ModeloItem = { stage: string; dias: number }

const DEFAULT_MODELO: ModeloItem[] = [
  { stage: 'Criada',                        dias: 1 },
  { stage: 'Iniciada',                       dias: 2 },
  { stage: 'Assinatura pendente',            dias: 2 },
  { stage: 'Finalizada - aguardando nota',   dias: 2 },
  { stage: 'Nota emitida',                   dias: 2 },
  { stage: 'Liquidada',                      dias: 2 },
  { stage: 'Paga parcialmente',              dias: 1 },
  { stage: 'Paga integralmente',             dias: 1 },
] // total: 13 dias úteis

function loadModelo(): ModeloItem[] {
  try {
    const s = localStorage.getItem('cronograma-modelo')
    if (!s) return DEFAULT_MODELO
    const parsed: ModeloItem[] = JSON.parse(s)
    return DEFAULT_MODELO.map(d => ({
      ...d,
      dias: parsed.find(p => p.stage === d.stage)?.dias ?? d.dias,
    }))
  } catch { return DEFAULT_MODELO }
}

function saveModelo(modelo: ModeloItem[]): void {
  try { localStorage.setItem('cronograma-modelo', JSON.stringify(modelo)) } catch {}
}

function autoFill(
  schedYear: number,
  schedMonth: number,
  modelo: ModeloItem[],
): Record<number, string> {
  const maxDays = daysInMonth(schedYear, schedMonth)
  const holidays = getHolidayMap(schedYear)
  const active = modelo.filter(m => m.dias > 0)
  if (active.length === 0) return {}

  const result: Record<number, string> = {}
  let stageIdx = 0
  let bizInStage = 0

  for (let day = 1; day <= maxDays; day++) {
    const dow = new Date(schedYear, schedMonth - 1, day).getDay()
    const isWknd = dow === 0 || dow === 6
    const isHoliday = !!holidays.get(`${schedMonth}-${day}`)

    if (!isWknd && !isHoliday) {
      bizInStage++
      while (stageIdx < active.length - 1 && bizInStage > active[stageIdx].dias) {
        stageIdx++
        bizInStage = 1
      }
      result[day] = active[stageIdx].stage
      // weekends/holidays: leave blank
    }
  }

  return result
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function Cronograma({ compact = false }: { compact?: boolean }) {
  const anoAtual = new Date().getFullYear()
  const [ano, setAno] = useState(anoAtual)
  const [activeStage, setActiveStage] = useState<string | null>(ETAPAS[0].key)
  const [modelo, setModelo] = useState<ModeloItem[]>(loadModelo)
  const [configs, setConfigs] = useState<Record<string, Record<number, string>>>({})

  const painting = useRef(false)
  const paintValue = useRef<string | null>(null)
  const pendingTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const initialized = useRef(false)

  const queryClient = useQueryClient()

  const { data: cronogramaData, isLoading } = useQuery({
    queryKey: ['cronograma'],
    queryFn: () => cronogramaApi.getAll().then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (cronogramaData && !initialized.current) {
      initialized.current = true
      const converted: Record<string, Record<number, string>> = {}
      for (const [mk, days] of Object.entries(cronogramaData)) {
        converted[mk] = Object.fromEntries(
          Object.entries(days).map(([k, v]) => [Number(k), v])
        )
      }
      setConfigs(converted)
    }
  }, [cronogramaData])

  useEffect(() => {
    const stop = () => { painting.current = false }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  function debouncedSave(mk: string, cfg: Record<number, string>) {
    const prev = pendingTimeouts.current.get(mk)
    if (prev) clearTimeout(prev)
    const t = setTimeout(() => {
      pendingTimeouts.current.delete(mk)
      if (Object.keys(cfg).length === 0) {
        cronogramaApi.delete(mk).catch(() => {})
      } else {
        cronogramaApi.save(mk, Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, v]))).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: ['cronograma'] })
    }, 800)
    pendingTimeouts.current.set(mk, t)
  }

  function updateCell(compMonth: number, day: number, value: string | null) {
    const mk = `${ano}-${String(compMonth).padStart(2, '0')}`
    setConfigs(prev => {
      const cfg = { ...(prev[mk] ?? {}) }
      if (value === null) delete cfg[day]
      else cfg[day] = value
      debouncedSave(mk, cfg)
      return { ...prev, [mk]: cfg }
    })
  }

  function onCellDown(compMonth: number, day: number, e: React.MouseEvent) {
    e.preventDefault()
    const mk = `${ano}-${String(compMonth).padStart(2, '0')}`
    const cur = configs[mk]?.[day]
    const val = activeStage === null ? null : cur === activeStage ? null : activeStage
    painting.current = true
    paintValue.current = val
    updateCell(compMonth, day, val)
  }

  function onCellEnter(compMonth: number, day: number) {
    if (!painting.current) return
    updateCell(compMonth, day, paintValue.current)
  }

  function clearRow(compMonth: number) {
    const mk = `${ano}-${String(compMonth).padStart(2, '0')}`
    setConfigs(prev => {
      debouncedSave(mk, {})
      return { ...prev, [mk]: {} }
    })
  }

  function preencherAno() {
    if (!window.confirm(`Isso vai preencher automaticamente todos os meses de ${ano} com base no modelo de dias úteis. Configurações existentes serão substituídas. Continuar?`)) return
    for (let m = 1; m <= 12; m++) {
      const sched = nextMonth(ano, m)
      const filled = autoFill(sched.year, sched.month, modelo)
      const mk = `${ano}-${String(m).padStart(2, '0')}`
      setConfigs(prev => ({ ...prev, [mk]: filled }))
      debouncedSave(mk, filled)
    }
  }

  const totalDias = modelo.reduce((s, m) => s + m.dias, 0)
  const today = new Date()

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        {!compact && (
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cronograma</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Configure a etapa esperada por dia para cada competência de medição.
            </p>
          </div>
        )}
        <div className={`flex items-center gap-2 ${compact ? 'ml-auto' : ''}`}>
          {isLoading && <Loader2 size={14} className="text-gray-400 animate-spin" />}
          <button onClick={() => setAno(a => a - 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronLeft size={16} className="text-gray-500" />
          </button>
          <span className="text-base font-bold text-gray-700 w-12 text-center">{ano}</span>
          <button onClick={() => setAno(a => a + 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronRight size={16} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Modelo de preenchimento automático */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Modelo de dias úteis por etapa
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Fins de semana e feriados não contam. Dias 0 pulam a etapa.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={`text-sm font-bold tabular-nums ${
              totalDias === 13 ? 'text-green-600' : totalDias < 13 ? 'text-amber-500' : 'text-red-500'
            }`}>
              {totalDias}d úteis
            </span>
            <button
              onClick={preencherAno}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gov-blue hover:bg-gov-blue-dark text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Wand2 size={13} />
              Preencher {ano}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
          {modelo.map((m, i) => (
            <div key={m.stage} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: ETAPA_COLOR[m.stage] }}
              />
              <span className="text-xs text-gray-600 whitespace-nowrap">
                {STAGE_SHORT[m.stage]}
              </span>
              <input
                type="number"
                min={0}
                max={30}
                value={m.dias}
                onChange={e => {
                  const dias = Math.max(0, Math.min(30, Number(e.target.value) || 0))
                  const next = modelo.map((s, j) => j === i ? { ...s, dias } : s)
                  setModelo(next)
                  saveModelo(next)
                }}
                className="w-10 text-center text-xs font-semibold border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
              <span className="text-xs text-gray-400">d</span>
            </div>
          ))}
        </div>
      </div>

      {/* Paleta de etapas */}
      <div className="card">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Pintura manual — clique ou arraste nos dias para ajustar
        </p>
        <div className="flex flex-wrap gap-2">
          {ETAPAS.map(e => (
            <button
              key={e.key}
              onClick={() => setActiveStage(prev => prev === e.key ? null : e.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border-2 ${
                activeStage === e.key ? 'scale-105 shadow-sm' : 'border-transparent'
              }`}
              style={{
                backgroundColor: e.color + '18',
                borderColor: activeStage === e.key ? e.color : 'transparent',
                color: e.color,
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
              {e.key}
            </button>
          ))}
          <button
            onClick={() => setActiveStage(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
              activeStage === null
                ? 'bg-gray-100 border-gray-400 text-gray-700'
                : 'border-transparent text-gray-400 hover:bg-gray-50'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
            Borracha
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        <div
          className="overflow-x-auto"
          onMouseLeave={() => { painting.current = false }}
        >
          <table className="border-collapse" style={{ minWidth: 980 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th
                  className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 whitespace-nowrap sticky left-0 bg-gray-50 z-10 border-r border-gray-200"
                  style={{ minWidth: 150 }}
                >
                  Competência
                </th>
                {Array.from({ length: 31 }, (_, i) => (
                  <th
                    key={i}
                    className="text-center text-xs text-gray-400 py-2.5 select-none"
                    style={{ width: 26, minWidth: 26 }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </th>
                ))}
                <th style={{ minWidth: 60 }} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 12 }, (_, m) => {
                const compMonth = m + 1
                const mk = `${ano}-${String(compMonth).padStart(2, '0')}`
                const cfg = configs[mk] ?? {}
                const sched = nextMonth(ano, compMonth)
                const maxDays = daysInMonth(sched.year, sched.month)
                const hasConfig = Object.keys(cfg).length > 0
                const isActiveSched =
                  today.getFullYear() === sched.year && today.getMonth() + 1 === sched.month
                const todayDayNum = isActiveSched ? today.getDate() : -1

                const holidays = getHolidayMap(sched.year)
                const dayMeta: Array<{ dow: number; holiday: string | undefined }> = []
                for (let d = 1; d <= 31; d++) {
                  if (d > maxDays) { dayMeta.push({ dow: -1, holiday: undefined }); continue }
                  const dow = new Date(sched.year, sched.month - 1, d).getDay()
                  const holiday = holidays.get(`${sched.month}-${d}`)
                  dayMeta.push({ dow, holiday })
                }

                return (
                  <tr key={m} className="hover:bg-gray-50/60 group">
                    <td className="px-4 py-2 sticky left-0 bg-white group-hover:bg-gray-50/60 z-10 border-r border-gray-100">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                          {MESES[m]}/{ano}
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${hasConfig ? 'bg-green-400' : 'bg-gray-200'}`} />
                        </span>
                        <span className="text-[10px] text-gray-400 leading-none mt-0.5">
                          → {MESES[sched.month - 1]}/{sched.year}
                        </span>
                      </div>
                    </td>

                    {Array.from({ length: 31 }, (_, d) => {
                      const day = d + 1
                      const valid = day <= maxDays
                      const etapa = valid ? cfg[day] : undefined
                      const color = etapa ? ETAPA_COLOR[etapa] : null
                      const isToday = day === todayDayNum

                      const { dow, holiday } = dayMeta[d]

                      const emptyBg = '#F3F4F6'
                      const hoverCls = color ? 'hover:opacity-75' : 'hover:bg-gray-200'

                      const pad2 = (n: number) => String(n).padStart(2, '0')
                      const dateStr = valid ? `${pad2(day)}/${pad2(sched.month)}/${sched.year}` : ''
                      const dowLabel = valid ? DOW_ABBR[dow] : ''
                      const statusLabel = holiday
                        ? `${holiday}${etapa ? ` · ${etapa}` : ''}`
                        : etapa ?? (dow === 0 ? 'Domingo' : dow === 6 ? 'Sábado' : 'Não configurado')
                      const title = valid ? `${dateStr} (${dowLabel}) — ${statusLabel}` : ''

                      return (
                        <td key={d} className="p-[2px]" style={{ userSelect: 'none' }}>
                          {valid ? (
                            <div
                              className={`w-[22px] h-[22px] rounded cursor-pointer transition-all flex items-center justify-center ${
                                isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''
                              } ${hoverCls}`}
                              style={{ backgroundColor: color ?? emptyBg }}
                              onMouseDown={e => onCellDown(compMonth, day, e)}
                              onMouseEnter={() => onCellEnter(compMonth, day)}
                              title={title}
                            >
                            </div>
                          ) : (
                            <div className="w-[22px] h-[22px]" />
                          )}
                        </td>
                      )
                    })}

                    <td className="px-3 py-2 text-right">
                      {hasConfig && (
                        <button
                          onClick={() => clearRow(compMonth)}
                          className="text-[11px] text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 whitespace-nowrap"
                        >
                          Limpar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instruções */}
      <div className="flex items-start gap-2 text-xs text-gray-400 pb-2">
        <Info size={13} className="flex-shrink-0 mt-0.5 text-gray-300" />
        <div className="space-y-1">
          <p>
            Cada linha representa uma competência. Os dias mostrados são do <span className="font-semibold text-gray-500">mês seguinte</span> — o período em que a medição deve percorrer o fluxo.
          </p>
          <p>
            O anel azul indica hoje no período vigente.
            <span className="ml-2 text-green-500 font-semibold">●</span> Configurado &nbsp;
            <span className="text-gray-300 font-semibold">●</span> Sem configuração
          </p>
        </div>
      </div>
    </div>
  )
}
