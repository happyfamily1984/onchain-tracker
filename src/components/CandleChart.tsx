import { useEffect, useRef } from 'react'
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type UTCTimestamp,
} from 'lightweight-charts'
import { MA_COLORS, MA_PERIODS, type Candle, type TaResult } from '../lib/ta'

export type Lower = 'rsi' | 'macd' | 'stoch'
export interface Overlays { ma: boolean; bb: boolean; sr: boolean; fib: boolean }

const UP = '#22c77a', DOWN = '#ff5c6c'

export default function CandleChart({ candles, ta, overlays, lower, fmt }: {
  candles: Candle[]; ta: TaResult; overlays: Overlays; lower: Lower; fmt: (v: number) => string
}) {
  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8a94a8', fontSize: 11, panes: { separatorColor: '#262e40' } },
      grid: { vertLines: { color: 'rgba(38,46,64,.5)' }, horzLines: { color: 'rgba(38,46,64,.5)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#262e40' },
      timeScale: { borderColor: '#262e40', timeVisible: true, secondsVisible: false, rightOffset: 3 },
      localization: { locale: 'ko-KR' },
      handleScale: { axisPressedMouseMove: true, pinch: true, mouseWheel: true },
      handleScroll: { horzTouchDrag: true, vertTouchDrag: false },
    })
    chartRef.current = chart
    const T = (t: number) => t as UTCTimestamp
    const pts = (v: number[]) => v.map((x, i) => (isFinite(x) ? { time: T(candles[i].time), value: x } : { time: T(candles[i].time) }))

    // ── 가격(캔들) ──
    const priceFormat = { type: 'custom' as const, formatter: fmt, minMove: 0.01 }
    const main = chart.addSeries(CandlestickSeries, { priceFormat, upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN })
    main.setData(candles.map((c) => ({ time: T(c.time), open: c.open, high: c.high, low: c.low, close: c.close })))

    if (overlays.ma) for (const p of MA_PERIODS) chart.addSeries(LineSeries, { priceFormat, color: MA_COLORS[p], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(pts(ta.series.ma[p]))
    if (overlays.bb) {
      const o = { priceFormat, color: 'rgba(200,210,235,.45)', lineWidth: 1 as const, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
      chart.addSeries(LineSeries, o).setData(pts(ta.series.bb.up))
      chart.addSeries(LineSeries, o).setData(pts(ta.series.bb.lo))
    }
    if (overlays.sr) {
      main.createPriceLine({ price: ta.sr.support, color: UP, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '지지' })
      main.createPriceLine({ price: ta.sr.resistance, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '저항' })
    }
    if (overlays.fib) for (const l of ta.fib.levels) {
      if (l.ratio === 0 || l.ratio === 1) continue
      main.createPriceLine({ price: l.price, color: 'rgba(255,207,90,.6)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: `${(l.ratio * 100).toFixed(1)}%` })
    }

    // ── 거래량 ──
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1)
    vol.setData(candles.map((c) => ({ time: T(c.time), value: c.volume, color: c.close >= c.open ? 'rgba(34,199,122,.5)' : 'rgba(255,92,108,.5)' })))

    // ── 보조지표 ──
    const num = { type: 'price' as const, precision: 1, minMove: 0.1 }
    const lo = { priceFormat: num, lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false }
    if (lower === 'rsi') {
      const s = chart.addSeries(LineSeries, { ...lo, color: '#ffcf5a', priceFormat: { type: 'price' as const, precision: 0, minMove: 1 } }, 2)
      s.setData(pts(ta.series.rsi))
      s.createPriceLine({ price: 70, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '과매수' })
      s.createPriceLine({ price: 30, color: UP, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '과매도' })
    } else if (lower === 'macd') {
      const m = ta.series.macd
      const short = { type: 'custom' as const, formatter: (v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(Math.abs(v) >= 10 ? 0 : 2)), minMove: 0.01 }
      chart.addSeries(HistogramSeries, { priceFormat: short, priceLineVisible: false, lastValueVisible: false }, 2)
        .setData(m.hist.map((x, i) => (isFinite(x) ? { time: T(candles[i].time), value: x, color: x >= 0 ? 'rgba(34,199,122,.6)' : 'rgba(255,92,108,.6)' } : { time: T(candles[i].time) })))
      chart.addSeries(LineSeries, { ...lo, priceFormat: short, color: '#4fb3ff' }, 2).setData(pts(m.line))
      chart.addSeries(LineSeries, { ...lo, priceFormat: short, color: '#ff7a59' }, 2).setData(pts(m.signal))
    } else {
      const s = chart.addSeries(LineSeries, { ...lo, color: '#4fb3ff', priceFormat: { type: 'price' as const, precision: 0, minMove: 1 } }, 2)
      s.setData(pts(ta.series.stoch.k))
      chart.addSeries(LineSeries, { ...lo, color: '#ff7a59' }, 2).setData(pts(ta.series.stoch.d))
      s.createPriceLine({ price: 80, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '천장권' })
      s.createPriceLine({ price: 20, color: UP, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '바닥권' })
    }

    const panes = chart.panes()
    panes[0]?.setStretchFactor(3)
    panes[1]?.setStretchFactor(0.8)
    panes[2]?.setStretchFactor(1.2)
    // 처음엔 최근 캔들 90개 정도를 보여줌
    const n = candles.length
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 90), to: n + 2 })

    return () => { chart.remove(); chartRef.current = null }
  }, [candles, ta, overlays, lower, fmt])

  return <div ref={box} className="candle-chart" />
}
