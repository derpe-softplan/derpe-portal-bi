import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

interface Props {
  option: Record<string, unknown>
  height?: number | string
  className?: string
  onEvents?: Record<string, (params: unknown) => void>
}

export function EChart({ option, height = 300, className = '', onEvents }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chart.current = echarts.init(ref.current, undefined, { renderer: 'svg' })
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      chart.current?.dispose()
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  useEffect(() => {
    const c = chart.current
    if (!c || !onEvents) return
    Object.entries(onEvents).forEach(([ev, handler]) => c.on(ev, handler as (p: unknown) => void))
    return () => {
      Object.entries(onEvents).forEach(([ev, handler]) =>
        c.off(ev, handler as (p: unknown) => void)
      )
    }
  }, [onEvents])

  return (
    <div
      ref={ref}
      className={className}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    />
  )
}
