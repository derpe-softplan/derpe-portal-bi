const KPI = ['#0068FF', '#3AE8C6', '#FF6700', '#ED282C']
const CHARTS = [
  { color: '#F97316', bars: [60, 80, 35, 95, 50, 70] },
  { color: '#10B981', bars: [45, 70, 85, 30, 60, 75] },
  { color: '#0EA5E9', bars: [80, 45, 65, 90, 40, 55] },
  { color: '#8B5CF6', bars: [50, 75, 40, 85, 65, 30] },
]
const ROWS = [null, '#FFFBEB', null, '#FEF2F2', null]

function FluxoMedicoesThumbnail() {
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: 'linear-gradient(150deg,#EBF3FF 0%,#f8fafc 100%)', padding: '8px', boxSizing: 'border-box' }}>
      {/* KPI row */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        {KPI.map((color, i) => (
          <div key={i} style={{ flex: 1, borderRadius: '5px', background: '#fff', borderLeft: `3px solid ${color}`, padding: '4px 5px' }}>
            <div style={{ height: '3px', background: color + '30', borderRadius: '2px', marginBottom: '3px' }} />
            <div style={{ height: '5px', width: '70%', background: color + '50', borderRadius: '2px' }} />
          </div>
        ))}
      </div>

      {/* 2×2 charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '6px' }}>
        {CHARTS.map(({ color, bars }, ci) => (
          <div key={ci} style={{ background: '#fff', borderRadius: '5px', padding: '4px' }}>
            <div style={{ height: '3px', width: '55%', background: '#E5E7EB', borderRadius: '2px', marginBottom: '4px' }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '22px' }}>
              {bars.map((h, bi) => (
                <div key={bi} style={{ flex: 1, height: `${h}%`, background: bi % 2 === 0 ? color : color + '70', borderRadius: '2px 2px 0 0' }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{ height: '7px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }} />
        {ROWS.map((bg, ri) => (
          <div key={ri} style={{ display: 'flex', gap: '4px', padding: '2px 6px', borderBottom: '1px solid #F3F4F6', background: bg ?? '#fff' }}>
            <div style={{ height: '3px', flex: 2, background: '#E5E7EB', borderRadius: '2px' }} />
            <div style={{ height: '3px', flex: 1, background: '#E5E7EB', borderRadius: '2px' }} />
            <div style={{ height: '3px', width: '16px', background: bg ? (bg.includes('FEF') ? '#FCA5A5' : '#FCD34D') : '#E5E7EB', borderRadius: '2px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export { FluxoMedicoesThumbnail as Thumbnail }
