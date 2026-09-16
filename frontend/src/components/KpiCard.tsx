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
  blue: { bg: '#EBF3FF', iconBg: '#C3DAFF', iconColor: '#004FCC', bar: '#0068FF' },
  green: { bg: '#EAFBE9', iconBg: '#C5F3C2', iconColor: '#2D8A29', bar: '#4AE23D' },
  teal: { bg: '#E0FCF7', iconBg: '#B2F7E8', iconColor: '#1A8C77', bar: '#3AE8C6' },
  yellow: { bg: '#FFF8E0', iconBg: '#FFF0A0', iconColor: '#8A6B00', bar: '#FFCE00' },
  amber: { bg: '#FFF4E0', iconBg: '#FFE5A0', iconColor: '#8A5A00', bar: '#FFB000' },
  red: { bg: '#FDECEC', iconBg: '#F9C9C9', iconColor: '#C41C1F', bar: '#ED282C' },
  orange: { bg: '#FFF0E6', iconBg: '#FFD4B2', iconColor: '#CC4E00', bar: '#FF6700' },
  purple: { bg: '#EDE5FF', iconBg: '#C7B3FF', iconColor: '#3300CC', bar: '#4400FF' },
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
      style={{
        backgroundColor: a.bg,
        borderColor: 'transparent',
        borderLeftColor: a.bar,
        borderLeftWidth: '4px',
      }}
      className={`card relative transition-all ${
        clickable
          ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0'
          : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider leading-none">
              {title}
            </p>
            {tooltip && (
              <div className="relative group/tip flex-shrink-0">
                <Info
                  size={11}
                  className="text-gray-300 hover:text-gray-500 cursor-help transition-colors"
                />
                <div className="absolute bottom-full left-0 mb-2 z-50 hidden group-hover/tip:block w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 leading-relaxed shadow-xl pointer-events-none">
                  {tooltip}
                  <span className="absolute top-full left-3 border-4 border-transparent border-t-gray-900" />
                </div>
              </div>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div
          style={{ backgroundColor: a.iconBg, color: a.iconColor }}
          className="p-2.5 rounded-lg flex-shrink-0 ml-3"
        >
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
