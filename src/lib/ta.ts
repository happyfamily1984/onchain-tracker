/**
 * 차트 기술적 분석 — 캔들 불러오기, 보조지표 계산, 쉬운 말 해석
 */

export type ChartAsset = 'bitcoin' | 'ethereum'
export type Interval = '1h' | '6h' | '1d' | '1w'

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }

export const INTERVALS: { v: Interval; l: string; desc: string }[] = [
  { v: '1h', l: '1시간', desc: '캔들 1개 = 1시간' },
  { v: '6h', l: '6시간', desc: '캔들 1개 = 6시간' },
  { v: '1d', l: '일봉', desc: '캔들 1개 = 하루' },
  { v: '1w', l: '주봉', desc: '캔들 1개 = 1주일' },
]

const PRODUCT: Record<ChartAsset, string> = { bitcoin: 'BTC-USD', ethereum: 'ETH-USD' }

async function getJSON<T>(url: string): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally { clearTimeout(t) }
}

/** 코인베이스 캔들 (요청당 최대 300개) */
async function coinbase(asset: ChartAsset, gran: number, pages: number): Promise<Candle[]> {
  const out = new Map<number, Candle>()
  let end = Math.floor(Date.now() / 1000)
  for (let i = 0; i < pages; i++) {
    const start = end - gran * 299
    const url = `https://api.exchange.coinbase.com/products/${PRODUCT[asset]}/candles?granularity=${gran}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`
    const rows = await getJSON<number[][]>(url)
    for (const [t, low, high, open, close, vol] of rows) out.set(t, { time: t, open, high, low, close, volume: vol })
    end = start - gran
  }
  return [...out.values()].sort((a, b) => a.time - b.time)
}

/** 대체: 크라켄 (최근 720개) */
async function kraken(asset: ChartAsset, minutes: number): Promise<Candle[]> {
  const pair = asset === 'bitcoin' ? 'XBTUSD' : 'ETHUSD'
  const j = await getJSON<any>(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${minutes}`)
  const k = Object.keys(j.result).find((x) => x !== 'last')!
  return j.result[k].map((r: any[]) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[6] }))
}

function toWeekly(d: Candle[]): Candle[] {
  const out: Candle[] = []
  for (const c of d) {
    // 월요일 시작 주
    const wk = Math.floor((c.time / 86400 + 3) / 7)
    const last = out[out.length - 1]
    if (last && Math.floor((last.time / 86400 + 3) / 7) === wk) {
      last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.volume += c.volume
    } else out.push({ ...c })
  }
  return out
}

export async function fetchCandles(asset: ChartAsset, iv: Interval): Promise<Candle[]> {
  try {
    if (iv === '1h') return await coinbase(asset, 3600, 2)
    if (iv === '6h') return await coinbase(asset, 21600, 2)
    if (iv === '1d') return await coinbase(asset, 86400, 2)
    return toWeekly(await coinbase(asset, 86400, 6))
  } catch {
    if (iv === '1h') return kraken(asset, 60)
    if (iv === '6h') return kraken(asset, 240)
    if (iv === '1d') return kraken(asset, 1440)
    return kraken(asset, 10080)
  }
}

// ───── 보조지표 ─────
export function sma(v: number[], n: number): number[] {
  const out = new Array(v.length).fill(NaN)
  let s = 0
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) out[i] = s / n }
  return out
}

export function ema(v: number[], n: number): number[] {
  const out = new Array(v.length).fill(NaN)
  const k = 2 / (n + 1)
  let prev = NaN
  for (let i = 0; i < v.length; i++) {
    if (i === n - 1) { let s = 0; for (let j = 0; j < n; j++) s += v[j]; prev = s / n; out[i] = prev }
    else if (i >= n) { prev = v[i] * k + prev * (1 - k); out[i] = prev }
  }
  return out
}

export function bollinger(v: number[], n = 20, m = 2) {
  const mid = sma(v, n)
  const up: number[] = [], lo: number[] = []
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) { up.push(NaN); lo.push(NaN); continue }
    let s = 0; for (let j = i - n + 1; j <= i; j++) s += (v[j] - mid[i]) ** 2
    const sd = Math.sqrt(s / n)
    up.push(mid[i] + m * sd); lo.push(mid[i] - m * sd)
  }
  return { mid, up, lo }
}

export function rsi(v: number[], n = 14): number[] {
  const out = new Array(v.length).fill(NaN)
  let g = 0, l = 0
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1]
    const up = Math.max(d, 0), dn = Math.max(-d, 0)
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = 100 - 100 / (1 + g / (l || 1e-9)) } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = 100 - 100 / (1 + g / (l || 1e-9)) }
  }
  return out
}

export function macd(v: number[], f = 12, s = 26, sig = 9) {
  const a = ema(v, f), b = ema(v, s)
  const line = v.map((_, i) => a[i] - b[i])
  const first = line.findIndex((x) => isFinite(x))
  const sl = new Array(v.length).fill(NaN)
  const e = ema(line.slice(first), sig)
  e.forEach((x, i) => (sl[first + i] = x))
  return { line, signal: sl, hist: line.map((x, i) => x - sl[i]) }
}

export function stochastic(c: Candle[], n = 14, kS = 3, dS = 3) {
  const raw = c.map((_, i) => {
    if (i < n - 1) return NaN
    let hi = -Infinity, lo = Infinity
    for (let j = i - n + 1; j <= i; j++) { hi = Math.max(hi, c[j].high); lo = Math.min(lo, c[j].low) }
    return hi === lo ? 50 : ((c[i].close - lo) / (hi - lo)) * 100
  })
  const k = smaNaN(raw, kS)
  return { k, d: smaNaN(k, dS) }
}

function smaNaN(v: number[], n: number) {
  return v.map((_, i) => { if (i < n - 1) return NaN; let s = 0; for (let j = i - n + 1; j <= i; j++) { if (!isFinite(v[j])) return NaN; s += v[j] } return s / n })
}

export function atr(c: Candle[], n = 14): number[] {
  const tr = c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))))
  return sma(tr, n)
}

/** 최근 고점·저점 꼭짓점으로 지지선·저항선 찾기 */
export function levels(c: Candle[], look = 120, w = 3) {
  const s = c.slice(-look)
  const highs: number[] = [], lows: number[] = []
  for (let i = w; i < s.length - w; i++) {
    let isH = true, isL = true
    for (let j = i - w; j <= i + w; j++) { if (s[j].high > s[i].high) isH = false; if (s[j].low < s[i].low) isL = false }
    if (isH) highs.push(s[i].high)
    if (isL) lows.push(s[i].low)
  }
  const price = c[c.length - 1].close
  const resistance = highs.filter((h) => h > price).sort((a, b) => a - b)[0] ?? Math.max(...s.map((x) => x.high))
  const support = lows.filter((l) => l < price).sort((a, b) => b - a)[0] ?? Math.min(...s.map((x) => x.low))
  return { support, resistance }
}

/** 피보나치 되돌림 (최근 구간 최고·최저) */
export function fibonacci(c: Candle[], look = 120) {
  const s = c.slice(-look)
  let hi = -Infinity, lo = Infinity, hiI = 0, loI = 0
  s.forEach((x, i) => { if (x.high > hi) { hi = x.high; hiI = i } if (x.low < lo) { lo = x.low; loI = i } })
  const upTrend = loI < hiI // 저점 → 고점 순서면 상승 구간의 되돌림
  const r = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
  const lv = r.map((x) => ({ ratio: x, price: upTrend ? hi - (hi - lo) * x : lo + (hi - lo) * x }))
  return { hi, lo, upTrend, levels: lv }
}

// ───── 해석 ─────
export type Signal = 'buy' | 'sell' | 'neutral'

export interface TaItem {
  id: string
  emoji: string
  title: string
  tech: string
  value: string
  signal: Signal
  /** 한 줄 결론 */
  say: string
  /** 지금 상태 쉬운 설명 */
  text: string
  /** 이 지표 보는 법 */
  how: string
}

export interface TaResult {
  items: TaItem[]
  buy: number
  sell: number
  neutral: number
  score: number // -100(매도 우세) ~ +100(매수 우세)
  verdict: string
  verdictTone: Signal
  series: {
    ma: Record<number, number[]>
    bb: ReturnType<typeof bollinger>
    rsi: number[]
    macd: ReturnType<typeof macd>
    stoch: ReturnType<typeof stochastic>
    volMa: number[]
  }
  sr: { support: number; resistance: number }
  fib: ReturnType<typeof fibonacci>
}

const pc = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`
const last = (v: number[]) => v[v.length - 1]
const prev = (v: number[], k = 1) => v[v.length - 1 - k]

export const MA_PERIODS = [5, 20, 60, 120] as const
export const MA_COLORS: Record<number, string> = { 5: '#f5c542', 20: '#ff7a59', 60: '#4fb3ff', 120: '#b07cff' }

export function analyze(c: Candle[], unit: string, fmt: (v: number) => string): TaResult {
  const close = c.map((x) => x.close)
  const price = last(close)
  const ma: Record<number, number[]> = {}
  for (const p of MA_PERIODS) ma[p] = sma(close, p)
  const bb = bollinger(close)
  const r = rsi(close)
  const m = macd(close)
  const st = stochastic(c)
  const vol = c.map((x) => x.volume)
  const volMa = sma(vol, 20)
  const sr = levels(c)
  const fib = fibonacci(c)
  const a = atr(c)
  const items: TaItem[] = []

  // 1. 이동평균선 배열
  {
    const v = MA_PERIODS.map((p) => last(ma[p]))
    const ok = v.every(isFinite)
    const bull = ok && v[0] > v[1] && v[1] > v[2] && v[2] > v[3]
    const bear = ok && v[0] < v[1] && v[1] < v[2] && v[2] < v[3]
    const above = MA_PERIODS.filter((p) => price > last(ma[p])).length
    items.push({
      id: 'ma', emoji: '📈', title: '이동평균선 배열', tech: '이평선 정배열·역배열',
      value: `가격이 이평선 ${MA_PERIODS.length}개 중 ${above}개 위`,
      signal: bull || above >= 3 ? 'buy' : bear || above <= 1 ? 'sell' : 'neutral',
      say: bull ? '👍 정배열 — 오르는 힘이 강해요' : bear ? '👎 역배열 — 내리는 힘이 강해요' : above >= 3 ? '🙂 대체로 오르는 쪽이에요' : above <= 1 ? '🙁 대체로 내리는 쪽이에요' : '😐 방향이 섞여 있어요',
      text: bull ? `짧은 평균(5)부터 긴 평균(120)까지 위에서 아래로 차례대로 놓여 있어요. 최근 가격이 계속 더 높게 형성되고 있다는 뜻이에요.`
        : bear ? `짧은 평균이 긴 평균보다 아래에 차례대로 놓여 있어요. 최근 가격이 계속 더 낮아지고 있다는 뜻이에요.`
          : above >= 3 ? `가격이 이평선 ${MA_PERIODS.length}개 중 ${above}개보다 위에 있어요. 줄이 가지런하진 않지만 오르는 쪽 힘이 더 커요.`
            : above <= 1 ? `가격이 이평선 ${MA_PERIODS.length}개 중 ${MA_PERIODS.length - above}개보다 아래에 있어요. 최근 평균 가격들보다 싸게 거래되고 있어 내리는 쪽 힘이 더 커요.`
              : `이평선들이 뒤섞여 있어요. 오르고 내림이 정해지지 않은 쉬어가는 구간일 수 있어요.`,
      how: `이동평균선은 최근 ${unit} 여러 개의 평균 가격을 이은 선이에요. 5·20·60·120은 각각 최근 캔들 5개, 20개, 60개, 120개 평균이에요. 짧은 선이 위에 있으면(정배열) 상승 추세, 아래에 있으면(역배열) 하락 추세로 봐요.`,
    })
  }

  // 2. 골든크로스·데드크로스 (20 vs 60)
  {
    const a20 = ma[20], a60 = ma[60]
    let cross: 'golden' | 'dead' | null = null, ago = -1
    for (let k = 0; k < 15; k++) {
      const i = a20.length - 1 - k
      if (i < 1 || !isFinite(a60[i - 1])) break
      if (a20[i] > a60[i] && a20[i - 1] <= a60[i - 1]) { cross = 'golden'; ago = k; break }
      if (a20[i] < a60[i] && a20[i - 1] >= a60[i - 1]) { cross = 'dead'; ago = k; break }
    }
    const above = last(a20) > last(a60)
    const gap = last(a20) / last(a60) - 1
    items.push({
      id: 'cross', emoji: '✨', title: '골든크로스 · 데드크로스', tech: '20일선과 60일선의 교차',
      value: cross ? `${ago === 0 ? '방금' : `캔들 ${ago}개 전`} ${cross === 'golden' ? '골든크로스' : '데드크로스'}` : `20선이 60선보다 ${above ? '위' : '아래'} (${pc(gap)})`,
      signal: cross === 'golden' || (!cross && above) ? 'buy' : cross === 'dead' || (!cross && !above) ? 'sell' : 'neutral',
      say: cross === 'golden' ? '✨ 골든크로스 발생! 상승 신호예요' : cross === 'dead' ? '⚠️ 데드크로스 발생! 하락 신호예요' : above ? '🙂 단기 평균이 중기 평균 위예요' : '🙁 단기 평균이 중기 평균 아래예요',
      text: cross ? `최근 20선이 60선을 ${cross === 'golden' ? '아래에서 위로' : '위에서 아래로'} 뚫었어요. 흐름이 ${cross === 'golden' ? '오르는 쪽' : '내리는 쪽'}으로 바뀌었다는 대표적인 신호예요.`
        : `최근 교차는 없었어요. 20선이 60선보다 ${above ? '위에 있어 오르는 흐름이 유지' : '아래에 있어 내리는 흐름이 유지'}되고 있어요.`,
      how: '짧은 평균선(20)이 긴 평균선(60)을 아래에서 위로 뚫으면 “골든크로스”(상승 전환 신호), 위에서 아래로 뚫으면 “데드크로스”(하락 전환 신호)라고 해요. 이미 오른 뒤에 나오는 늦은 신호라는 점도 알아두세요.',
    })
  }

  // 3. RSI
  {
    const v = last(r)
    items.push({
      id: 'rsi', emoji: '🌡️', title: '과열 · 침체 정도', tech: 'RSI (14)',
      value: v.toFixed(0),
      signal: v < 30 ? 'buy' : v > 70 ? 'sell' : v >= 50 ? 'buy' : 'sell',
      say: v < 30 ? '🥶 너무 많이 떨어졌어요 (과매도)' : v > 70 ? '🔥 너무 많이 올랐어요 (과매수)' : v >= 50 ? '🙂 사려는 힘이 조금 더 커요' : '🙁 팔려는 힘이 조금 더 커요',
      text: v < 30 ? `RSI가 ${v.toFixed(0)}으로 30 아래예요. 짧은 기간에 많이 떨어져서 반등이 나오기 쉬운 구간이에요. 다만 하락이 더 이어질 수도 있어요.`
        : v > 70 ? `RSI가 ${v.toFixed(0)}으로 70 위예요. 짧은 기간에 많이 올라서 숨 고르기(조정)가 나오기 쉬운 구간이에요.`
          : `RSI가 ${v.toFixed(0)}으로 보통 범위(30~70)예요. ${v >= 50 ? '50보다 높아 오르는 힘이 조금 앞서요.' : '50보다 낮아 내리는 힘이 조금 앞서요.'}`,
      how: 'RSI는 최근 14개 캔들 동안 오른 폭과 내린 폭을 비교해 0~100으로 나타낸 값이에요. 70 이상이면 너무 많이 오른 “과매수”, 30 이하면 너무 많이 떨어진 “과매도”로 봐요.',
    })
  }

  // 4. MACD
  {
    const L = last(m.line), S = last(m.signal), H = last(m.hist), H1 = prev(m.hist)
    let cross: 'up' | 'down' | null = null
    for (let k = 0; k < 5; k++) {
      const i = m.hist.length - 1 - k
      if (m.hist[i] > 0 && m.hist[i - 1] <= 0) { cross = 'up'; break }
      if (m.hist[i] < 0 && m.hist[i - 1] >= 0) { cross = 'down'; break }
    }
    const growing = Math.abs(H) > Math.abs(H1)
    items.push({
      id: 'macd', emoji: '🌊', title: '추세의 힘', tech: 'MACD (12, 26, 9)',
      value: `${L > S ? '시그널선 위' : '시그널선 아래'} · 막대 ${H > 0 ? '+' : '−'}${growing ? ' 커지는 중' : ' 줄어드는 중'}`,
      signal: L > S ? 'buy' : 'sell',
      say: cross === 'up' ? '✨ 방금 매수 신호가 나왔어요' : cross === 'down' ? '⚠️ 방금 매도 신호가 나왔어요' : L > S ? (growing ? '💪 오르는 힘이 세지고 있어요' : '🙂 오르는 힘이 약해지고 있어요') : (growing ? '👎 내리는 힘이 세지고 있어요' : '🙂 내리는 힘이 약해지고 있어요'),
      text: L > S ? `MACD선이 시그널선 위에 있어 상승 쪽 힘이 우세해요. 막대가 ${growing ? '커지고 있어 그 힘이 강해지는 중' : '작아지고 있어 힘이 빠지는 중'}이에요.`
        : `MACD선이 시그널선 아래에 있어 하락 쪽 힘이 우세해요. 막대가 ${growing ? '커지고 있어 내리는 힘이 강해지는 중' : '작아지고 있어 내리는 힘이 약해지는 중(반등 준비)'}이에요.`,
      how: 'MACD는 짧은 평균과 긴 평균의 차이로 추세의 힘을 보여줘요. MACD선이 시그널선을 위로 뚫으면 매수 신호, 아래로 뚫으면 매도 신호예요. 아래 막대(히스토그램)가 커질수록 그 방향의 힘이 강해요.',
    })
  }

  // 5. 볼린저밴드
  {
    const up = last(bb.up), lo = last(bb.lo), mid = last(bb.mid)
    const pos = (price - lo) / (up - lo)
    const width = (up - lo) / mid
    const widths = bb.up.map((u, i) => (u - bb.lo[i]) / bb.mid[i]).filter(isFinite).slice(-120)
    const squeeze = width <= Math.min(...widths) * 1.15
    items.push({
      id: 'bb', emoji: '🎯', title: '가격의 정상 범위', tech: '볼린저밴드 (20, 2)',
      value: `밴드 안 위치 ${Math.round(pos * 100)}%${squeeze ? ' · 폭 좁아짐' : ''}`,
      signal: pos < 0.1 ? 'buy' : pos > 0.9 ? 'sell' : 'neutral',
      say: squeeze ? '⚡ 곧 크게 움직일 수 있어요 (밴드가 좁아짐)' : pos > 1 ? '🔥 정상 범위 위로 튀어나왔어요' : pos < 0 ? '🥶 정상 범위 아래로 떨어졌어요' : pos > 0.8 ? '⚠️ 정상 범위 위쪽 끝이에요' : pos < 0.2 ? '🙂 정상 범위 아래쪽 끝이에요' : '😐 정상 범위 한가운데예요',
      text: `${pos > 0.8 ? '가격이 밴드 위쪽에 붙어 있어 단기적으로 비싼 편이에요.' : pos < 0.2 ? '가격이 밴드 아래쪽에 붙어 있어 단기적으로 싼 편이에요.' : '가격이 밴드 가운데에 있어 특별히 치우치지 않았어요.'}${squeeze ? ' 그리고 밴드 폭이 최근 들어 가장 좁아요. 조용하던 가격이 곧 위든 아래든 크게 움직이는 경우가 많아요.' : ''}`,
      how: '볼린저밴드는 최근 20개 캔들 평균을 가운데에 두고, 가격이 보통 움직이는 범위를 위아래 띠로 보여줘요. 가격의 약 95%가 이 띠 안에서 움직여요. 위쪽 끝은 단기 과열, 아래쪽 끝은 단기 침체로 보고, 띠가 좁아지면 큰 움직임이 다가온다는 신호로 봐요.',
    })
  }

  // 6. 스토캐스틱
  {
    const K = last(st.k), D = last(st.d)
    items.push({
      id: 'stoch', emoji: '🎢', title: '최근 가격 위치', tech: '스토캐스틱 (14, 3, 3)',
      value: `%K ${K.toFixed(0)} · %D ${D.toFixed(0)}`,
      signal: K < 20 && K > D ? 'buy' : K > 80 && K < D ? 'sell' : K < 20 ? 'buy' : K > 80 ? 'sell' : 'neutral',
      say: K < 20 ? (K > D ? '👍 바닥권에서 고개를 드는 중' : '🥶 최근 범위의 바닥 근처예요') : K > 80 ? (K < D ? '👎 천장권에서 꺾이는 중' : '🔥 최근 범위의 천장 근처예요') : '😐 최근 범위의 중간이에요',
      text: `지금 가격은 최근 14개 캔들의 최저~최고 사이에서 ${K.toFixed(0)}% 위치예요. ${K < 20 ? '바닥 쪽이라 반등 가능성을 살펴볼 만해요.' : K > 80 ? '천장 쪽이라 쉬어갈 가능성이 있어요.' : '한쪽으로 치우치지 않았어요.'}`,
      how: '스토캐스틱은 최근 14개 캔들의 가장 낮은 가격을 0, 가장 높은 가격을 100으로 놓고 지금 가격이 어디쯤인지 보여줘요. 20 아래는 바닥권, 80 위는 천장권이에요. 빠른 선(%K)이 느린 선(%D)을 위로 뚫으면 매수 신호로 봐요.',
    })
  }

  // 7. 거래량
  {
    const v = last(vol), vm = last(volMa)
    const ratio = v / vm
    const up = price >= c[c.length - 2].close
    items.push({
      id: 'vol', emoji: '📊', title: '거래량', tech: '거래량 vs 20개 평균',
      value: `평균의 ${(ratio * 100).toFixed(0)}%`,
      signal: ratio > 1.5 ? (up ? 'buy' : 'sell') : 'neutral',
      say: ratio > 1.5 ? (up ? '🚀 거래가 크게 늘며 올라요' : '💥 거래가 크게 늘며 떨어져요') : ratio < 0.6 ? '😴 거래가 한산해요' : '😐 거래량은 평소 수준이에요',
      text: ratio > 1.5 ? `평소보다 ${(ratio).toFixed(1)}배 많이 거래됐어요. 많은 사람이 참여한 움직임이라 ${up ? '상승' : '하락'}에 힘이 실려 있어요.`
        : ratio < 0.6 ? '평소보다 거래가 적어요. 지금 움직임은 힘이 약해서 쉽게 뒤집힐 수 있어요.' : '거래량이 평소와 비슷해요.',
      how: '거래량은 얼마나 많이 사고팔았는지예요. 가격이 오를 때 거래량도 늘면 진짜 상승, 거래량 없이 오르면 힘없는 상승으로 봐요.',
    })
  }

  // 8. 지지선·저항선
  {
    const toR = sr.resistance / price - 1, toS = 1 - sr.support / price
    items.push({
      id: 'sr', emoji: '🧱', title: '바닥(지지) · 천장(저항)', tech: '지지선 · 저항선',
      value: `지지 ${fmt(sr.support)} · 저항 ${fmt(sr.resistance)}`,
      signal: toS < 0.03 ? 'buy' : toR < 0.03 ? 'sell' : 'neutral',
      say: toS < 0.03 ? '🧱 바닥(지지선) 바로 위예요' : toR < 0.03 ? '🚧 천장(저항선) 바로 아래예요' : '😐 바닥과 천장 사이에 있어요',
      text: `아래쪽 바닥은 ${fmt(sr.support)}(${(toS * 100).toFixed(1)}% 아래), 위쪽 천장은 ${fmt(sr.resistance)}(${(toR * 100).toFixed(1)}% 위)예요. ${toS < 0.03 ? '바닥 근처라 버텨 주면 반등, 깨지면 더 떨어질 수 있어요.' : toR < 0.03 ? '천장 근처라 뚫으면 더 오르고, 막히면 되돌아올 수 있어요.' : '두 가격을 넘는지 깨지는지 지켜보세요.'}`,
      how: '지지선은 예전에 가격이 떨어지다 멈추고 반등했던 가격대(바닥), 저항선은 오르다 막혔던 가격대(천장)예요. 차트에 초록·빨강 점선으로 표시돼요.',
    })
  }

  // 9. 피보나치 되돌림
  {
    const lv = fib.levels
    const near = lv.reduce((a, b) => (Math.abs(b.price - price) < Math.abs(a.price - price) ? b : a))
    const retr = fib.upTrend ? (fib.hi - price) / (fib.hi - fib.lo) : (price - fib.lo) / (fib.hi - fib.lo)
    items.push({
      id: 'fib', emoji: '🌀', title: '얼마나 되돌아왔나', tech: '피보나치 되돌림',
      value: `${(retr * 100).toFixed(0)}% 되돌림 · 가까운 선 ${(near.ratio * 100).toFixed(1)}%`,
      signal: fib.upTrend ? (retr > 0.5 && retr < 0.7 ? 'buy' : retr < 0.3 ? 'buy' : 'neutral') : (retr > 0.5 && retr < 0.7 ? 'sell' : 'neutral'),
      say: fib.upTrend ? (retr < 0.3 ? '🙂 오른 뒤 조금만 쉬고 있어요' : retr < 0.7 ? '🎯 오른 만큼의 절반쯤 되돌아왔어요' : '⚠️ 오른 만큼을 거의 다 내줬어요') : (retr < 0.3 ? '🙁 떨어진 뒤 조금만 반등했어요' : retr < 0.7 ? '🎯 떨어진 만큼의 절반쯤 반등했어요' : '🙂 떨어진 만큼을 거의 회복했어요'),
      text: fib.upTrend
        ? `최근 저점에서 고점까지 오른 폭 중 ${(retr * 100).toFixed(0)}%를 되돌렸어요. 38.2%~61.8% 구간은 상승장에서 쉬었다 다시 오르는 경우가 많은 자리예요.`
        : `최근 고점에서 저점까지 떨어진 폭 중 ${(retr * 100).toFixed(0)}%를 회복했어요. 38.2%~61.8% 구간은 하락장에서 반등이 막히기 쉬운 자리예요.`,
      how: '큰 상승(하락) 뒤 가격은 보통 일정 비율(23.6%, 38.2%, 50%, 61.8%)만큼 되돌아갔다가 원래 방향으로 다시 움직이는 경우가 많아요. 이 비율의 가격대를 버팀목이나 막힘 자리로 봐요.',
    })
  }

  // 10. 변동성
  {
    const v = last(a) / price
    const hist = a.map((x, i) => x / close[i]).filter(isFinite).slice(-120).sort((x, y) => x - y)
    const rank = hist.filter((x) => x < v).length / Math.max(1, hist.length)
    items.push({
      id: 'atr', emoji: '🌪️', title: '출렁임(변동성)', tech: 'ATR (14)',
      value: `캔들 하나당 평균 ±${(v * 100).toFixed(1)}%`,
      signal: 'neutral',
      say: rank > 0.8 ? '🌪️ 요즘 출렁임이 아주 커요' : rank < 0.2 ? '🍃 요즘 아주 잔잔해요' : '😐 출렁임은 보통이에요',
      text: `요즘 캔들 하나 동안 가격이 평균 ${(v * 100).toFixed(1)}% 정도 움직여요. ${rank > 0.8 ? '평소보다 크게 출렁이니 위험 관리에 신경 쓰세요.' : rank < 0.2 ? '평소보다 조용해서, 곧 큰 움직임이 나올 수도 있어요.' : ''}`,
      how: 'ATR은 최근 14개 캔들이 평균적으로 얼마나 크게 움직였는지 보여줘요. 방향(오름·내림)이 아니라 “흔들림의 크기”만 알려줘요.',
    })
  }

  const buy = items.filter((i) => i.signal === 'buy').length
  const sell = items.filter((i) => i.signal === 'sell').length
  const neutral = items.length - buy - sell
  const score = Math.round(((buy - sell) / items.length) * 100)
  const verdictTone: Signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : 'neutral'
  const verdict = score >= 50 ? '👍 오르는 신호가 많아요' : score >= 20 ? '🙂 오르는 신호가 조금 더 많아요' : score <= -50 ? '👎 내리는 신호가 많아요' : score <= -20 ? '🙁 내리는 신호가 조금 더 많아요' : '😐 신호가 엇갈려요'
  return { items, buy, sell, neutral, score, verdict, verdictTone, series: { ma, bb, rsi: r, macd: m, stoch: st, volMa }, sr, fib }
}
