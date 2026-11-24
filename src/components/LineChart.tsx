import { useEffect, useMemo, useRef, useState } from 'react'
import type { Point } from '../lib/api'
import { dateStr } from '../lib/format'

interface Props {
  points: Point[]
  color: string
  format: (v: number) => string
  height?: number
  timeFormat?: (t: number) => string
  /** 기준선 */
  refs?: number[]
}

export default function LineChart({ points, color, format, height = 180, timeFormat, refs }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pad = { t: 12, b: 22, l: 0, r: 0 }
  const geo = useMemo(() => {
    if (points.length < 2) return null
    const vs = points.map((p) => p.v)
    let min = Math.min(...vs), max = Math.max(...vs)
    // 데이터 범위 근처의 기준선은 보이도록 범위 확장
    for (const r of refs ?? []) { const span = max - min || 1; if (r >= min - span * 0.3 && r <= max + span * 0.3) { min = Math.min(min, r); max = Math.max(max, r) } }
    if (min === max) { min -= 1; max += 1 }
    const span = max - min
    min -= span * 0.08; max += span * 0.08
    const t0 = points[0].t, t1 = points[points.length - 1].t
    const x = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (w - pad.l - pad.r)
    const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b)
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
    const area = `${line}L${x(t1).toFixed(1)},${height - pad.b}L${x(t0).toFixed(1)},${height - pad.b}Z`
    return { x, y, line, area, t0, t1 }
  }, [points, w, height, refs])

  if (!geo) return <div className="chart-empty" style={{ height }}>데이터가 부족합니다</div>

  const tf = timeFormat ?? ((t: number) => dateStr(t))
  const first = points[0].v
  const sel = hover != null ? points[hover] : points[points.length - 1]
  const chg = first ? ((sel.v - first) / Math.abs(first)) * 100 : 0
  const gid = 'g' + color.replace(/[^a-z0-9]/gi, '')

  const onMove = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect()
    const px = clientX - r.left
    let best = 0, bd = Infinity
    points.forEach((p, i) => { const d = Math.abs(geo.x(p.t) - px); if (d < bd) { bd = d; best = i } })
    setHover(best)
  }

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-val">{format(sel.v)}</span>
        <span className={'chart-chg ' + (chg >= 0 ? 'up' : 'down')}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%</span>
        <span className="chart-date">{tf(sel.t)}</span>
      </div>
      <div
        ref={wrap}
        className="chart-svg"
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'mouse') onMove(e.clientX) }}
        onPointerLeave={() => setHover(null)}
        onPointerUp={(e) => { if (e.pointerType !== 'mouse') setHover(null) }}
        onPointerCancel={() => setHover(null)}
      >
        <svg width={w} height={height} role="img">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={w} y1={pad.t + f * (height - pad.t - pad.b)} y2={pad.t + f * (height - pad.t - pad.b)} className="grid" />
          ))}
          {(refs ?? []).map((r) => { const yy = geo.y(r); return yy >= pad.t && yy <= height - pad.b ? (
            <g key={r}><line x1={0} x2={w} y1={yy} y2={yy} className="ref" /><text x={w - 2} y={yy - 3} textAnchor="end" className="axis">{format(r)}</text></g>
          ) : null })}
          <path d={geo.area} fill={`url(#${gid})`} />
          <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          {hover != null && (
            <g>
              <line x1={geo.x(sel.t)} x2={geo.x(sel.t)} y1={pad.t} y2={height - pad.b} className="cross" />
              <circle cx={geo.x(sel.t)} cy={geo.y(sel.v)} r={4.5} fill={color} stroke="var(--bg)" strokeWidth={2} />
            </g>
          )}
          <text x={2} y={height - 6} className="axis">{tf(geo.t0)}</text>
          <text x={w - 2} y={height - 6} className="axis" textAnchor="end">{tf(geo.t1)}</text>
        </svg>
      </div>
    </div>
  )
}
