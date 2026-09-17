import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, X } from 'lucide-react'

const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export function MonthPicker({ value, onChange, placeholder = 'Selecionar' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const parsed = value
    ? { year: parseInt(value.slice(0, 4)), month: parseInt(value.slice(5, 7)) - 1 }
    : null

  const [viewYear, setViewYear] = useState(parsed?.year ?? new Date().getFullYear())

  useEffect(() => {
    if (parsed) setViewYear(parsed.year)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function select(monthIdx: number) {
    onChange(`${viewYear}-${String(monthIdx + 1).padStart(2, '0')}`)
    setOpen(false)
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  const display = parsed ? `${MES[parsed.month]} ${parsed.year}` : placeholder
  const hasValue = !!parsed

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm transition-all whitespace-nowrap select-none ${
          hasValue
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
            : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-400 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
        }`}
      >
        <Calendar size={13} className={hasValue ? 'text-blue-500' : 'text-gray-400'} />
        <span>{display}</span>
        {hasValue ? (
          <X
            size={12}
            onClick={clear}
            className="ml-0.5 text-blue-400 hover:text-blue-700 transition-colors"
          />
        ) : (
          <ChevronDown size={12} className="text-gray-300 ml-0.5" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 w-52">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MES.map((m, i) => {
              const isSelected = parsed?.year === viewYear && parsed?.month === i
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => select(i)}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  style={isSelected ? { backgroundColor: '#0068FF' } : undefined}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
