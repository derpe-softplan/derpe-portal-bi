import type { ReactNode } from 'react'
import { MousePointerClick, Info } from 'lucide-react'

interface Props {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  accent?: 'blue' | 'green' | 'yellow' | 'red' | 'orange' | 'purple' | 'teal' | 'amber'
  loading?: boolean
  onClick?: () => void
  tooltip?: string
}

const ACCENT = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    iconBg: 'bg-blue-100 dark:bg-blue-900/60',
    iconColor: 'text-blue-600 dark:text-blue-400',
    bar: 'border-blue-500',
    hexBar: '#0068FF',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/40',
    iconBg: 'bg-green-100 dark:bg-green-900/60',
    iconColor: 'text-green-600 dark:text-green-400',
    bar: 'border-green-500',
    hexBar: '#4AE23D',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    iconBg: 'bg-teal-100 dark:bg-teal-900/60',
    iconColor: 'text-teal-600 dark:text-teal-400',
    bar: 'border-teal-500',
    hexBar: '#3AE8C6',
  },
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/40',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/60',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    bar: 'border-yellow-500',
    hexBar: '#FFCE00',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    iconBg: 'bg-amber-100 dark:bg-amber-900/60',
    iconColor: 'text-amber-600 dark:text-amber-400',
    bar: 'border-amber-500',
    hexBar: '#FFB000',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    iconBg: 'bg-red-100 dark:bg-red-900/60',
    iconColor: 'text-red-600 dark:text-red-400',
    bar: 'border-red-500',
    hexBar: '#ED282C',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    iconBg: 'bg-orange-100 dark:bg-orange-900/60',
    iconColor: 'text-orange-600 dark:text-orange-400',
    bar: 'border-orange-500',
    hexBar: '#FF6700',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    iconBg: 'bg-purple-100 dark:bg-purple-900/60',
    iconColor: 'text-purple-600 dark:text-purple-400',
    bar: 'border-purple-500',
    hexBar: '#4400FF',
  },
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  accent = 'blue',
  loading,
  onClick,
  tooltip,
}: Props) {
  const a = ACCENT[accent]
  const clickable = !!onClick

  if (loading) {
    return (
      <div className="card border-transparent border-l-4">
        <div className="skeleton h-4 w-24 mb-3" />
        <div className="skeleton h-8 w-32 mb-2" />
        <div className="skeleton h-3 w-20" />
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      style={{ borderLeftColor: a.hexBar }}
      className={`${a.bg} card relative border-l-4 transition-all ${
        clickable
          ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0'
          : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-none">
              {title}
            </p>
            {tooltip && (
              <div className="relative group/tip flex-shrink-0">
                <Info
                  size={11}
                  className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-help transition-colors"
                />
                <div className="absolute bottom-full left-0 mb-2 z-50 hidden group-hover/tip:block w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 leading-relaxed shadow-xl pointer-events-none">
                  {tooltip}
                  <span className="absolute top-full left-3 border-4 border-transparent border-t-gray-900" />
                </div>
              </div>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`${a.iconBg} ${a.iconColor} p-2.5 rounded-lg flex-shrink-0 ml-3`}>
          {icon}
        </div>
      </div>
      {clickable && (
        <div className="absolute bottom-2 right-2 text-gray-300">
          <MousePointerClick size={12} />
        </div>
      )}
    </div>
  )
}
