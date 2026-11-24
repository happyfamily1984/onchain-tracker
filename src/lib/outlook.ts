/**
 * 상승 가능성 (단기 2주 · 중기 3개월 · 장기 1년)
 *
 * 방법: 여러 온체인·가격 신호를 -1(하락 쪽)~+1(상승 쪽) 점수로 바꿔 기간별 가중 평균(종합 점수)을 낸 뒤,
 * 과거 5년 가운데 종합 점수가 지금과 비슷했던 날들을 찾아 "그 뒤 실제로 올랐던 비율"을 % 로 보여준다.
 * 미래를 맞히는 값이 아니라 과거 비슷한 상황의 결과다.
 */
import { bci, dense, stables, type Series } from './indicators'

export type Asset = 'bitcoin' | 'ethereum'
export type HorizonId = 'short' | 'mid' | 'long'

export const HORIZONS: { id: HorizonId; label: string; period: string; days: number }[] = [
  { id: 'short', label: '단기', period: '2주 뒤', days: 14 },
  { id: 'mid', label: '중기', period: '3개월 뒤', days: 90 },
  { id: 'long', label: '장기', period: '1년 뒤', days: 365 },
]

export interface Reason { text: string; dir: 1 | -1; strength: number }

export interface HorizonResult {
  id: HorizonId
  label: string
  period: string
  days: number
  /** 상승 가능성 (%) */
  prob: number
  level: { label: string; tone: 'up' | 'flat' | 'down' }
  /** 비슷했던 과거 날 수 / 그중 오른 날 수 */
  samples: number
  ups: number
  /** 비슷했던 날들의 기간 수익률 중앙값 (%) */
  typical: number
  /** 아무 날에나 샀을 때 오른 비율 (%) */
  base: number
  /** 믿을 만한 정도: 기간이 겹치는 날을 감안한 실제 사례 수 기준 */
  trust: '높음' | '보통' | '낮음'
  reasons: Reason[]
}

export interface OutlookResult { asset: Asset; horizons: HorizonResult[]; from: number; to: number }

// ───── 도구 ─────
const clamp = (x: number) => Math.max(-1, Math.min(1, x))
const pct = (x: number, d = 0) => `${Math.abs(x * 100).toFixed(d)}%`

/** 여러 일별 시리즈를 같은 날짜 축에 맞춤 */
function align(list: Series[]): { start: number; cols: number[][] } {
  const ds = list.map(dense)
  const start = Math.max(...ds.map((d) => d.start))
  const end = Math.min(...ds.map((d) => d.start + d.v.length - 1))
  const cols = ds.map((d) => { const out: number[] = []; for (let t = start; t <= end; t++) out.push(d.v[t - d.start]); return out })
  return { start, cols }
}

/** 이동평균: 비정상 값(0으로 나눔 등)은 건너뛰고, 창의 80% 이상이 정상일 때만 계산 */
function sma(v: number[], n: number): number[] {
  const out: number[] = new Array(v.length).fill(NaN)
  let sum = 0, cnt = 0
  for (let i = 0; i < v.length; i++) {
    if (isFinite(v[i])) { sum += v[i]; cnt++ }
    if (i >= n && isFinite(v[i - n])) { sum -= v[i - n]; cnt-- }
    if (i >= n - 1 && cnt >= n * 0.8) out[i] = sum / cnt
  }
  return out
}

const ratio = (a: number[], b: number[]) => a.map((x, i) => { const r = x / b[i]; return isFinite(r) && b[i] > 0 ? r : NaN })
const change = (v: number[], n: number) => v.map((x, i) => (i >= n ? x / v[i - n] - 1 : NaN))

interface Feature {
  key: string
  values: number[]
  /** 값 → -1(하락 쪽)~+1(상승 쪽) */
  score: (x: number) => number
  /** 지금 값에 대한 쉬운 설명 */
  text: (x: number) => string
}

// ───── 신호 정의 ─────
function trend(price: number[], n: number, name: string): Feature {
  const v = ratio(price, sma(price, n)).map((x) => x - 1)
  return {
    key: 'trend' + n, values: v, score: (x) => clamp(x / (n <= 20 ? 0.08 : 0.15)),
    text: (x) => x >= 0 ? `가격이 최근 ${name} 평균보다 ${pct(x, 1)} 높아요 — 오르는 흐름이에요` : `가격이 최근 ${name} 평균보다 ${pct(x, 1)} 낮아요 — 내리는 흐름이에요`,
  }
}

function mayer(price: number[]): Feature {
  return {
    key: 'mayer', values: ratio(price, sma(price, 200)), score: (m) => clamp((1.15 - m) / 0.5),
    text: (m) => m < 0.95 ? `200일 평균보다 ${pct(1 - m)} 싸요 — 싸게 살 수 있는 구간이에요`
      : m > 1.5 ? `200일 평균보다 ${pct(m - 1)} 비싸요 — 많이 올라 쉬어갈 수 있어요`
        : `200일 평균과 비슷한 보통 가격이에요`,
  }
}

function stableFlow(stab: number[], n: number): Feature {
  return {
    key: 'stable' + n, values: change(stab, n), score: (x) => clamp(x / (n <= 14 ? 0.015 : 0.03)),
    text: (x) => x >= 0 ? `최근 ${n === 14 ? '2주' : '한 달'} 코인 살 돈(달러코인)이 ${pct(x, 1)} 늘었어요` : `최근 ${n === 14 ? '2주' : '한 달'} 코인 살 돈(달러코인)이 ${pct(x, 1)} 줄었어요`,
  }
}

// ───── 데이터 ─────
async function ethDaily(): Promise<{ price: Series; volume: Series }> {
  const price: Series = new Map(), volume: Series = new Map()
  const DAY = 86400_000
  let end = Date.now()
  try {
    for (let i = 0; i < 7; i++) {
      const start = end - 299 * DAY
      const url = `https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=86400&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`
      const r = await fetch(url)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const rows = (await r.json()) as number[][]
      for (const [t, , , , close, vol] of rows) { price.set(Math.floor(t / 86400), close); volume.set(Math.floor(t / 86400), vol * close) }
      end = start - DAY
    }
  } catch (e) {
    if (price.size < 400) {
      // 대체: Kraken 일봉 (최근 약 2년)
      const r = await fetch('https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1440')
      const j = await r.json()
      const k = Object.keys(j.result).find((x) => x !== 'last')!
      for (const row of j.result[k]) { const d = Math.floor(row[0] / 86400); price.set(d, Number(row[4])); volume.set(d, Number(row[6]) * Number(row[4])) }
    }
  }
  if (price.size < 400) throw new Error('이더리움 과거 가격을 충분히 불러오지 못했어요')
  return { price, volume }
}

async function features(asset: Asset): Promise<{ start: number; price: number[]; feats: Record<string, Feature> }> {
  if (asset === 'bitcoin') {
    const [P, R, H, V, A, M, S] = await Promise.all([
      bci('market-price'), bci('miners-revenue'), bci('hash-rate'), bci('estimated-transaction-volume-usd'),
      bci('n-unique-addresses'), bci('market-cap'), stables(),
    ])
    const { start, cols } = align([P, R, H, V, A, M, S])
    const [price, rev, hash, vol, addr, mcap, stab] = cols
    const puell = ratio(sma(rev, 7), sma(rev, 365))
    const hr = ratio(sma(hash, 30), sma(hash, 60)).map((x) => (x - 1) * 100)
    const nvt = ratio(mcap, sma(vol, 90))
    const nvtRel = ratio(nvt, sma(nvt, 365))
    const act = ratio(sma(addr, 30), sma(addr, 365)).map((x) => x - 1)
    const ssr = ratio(mcap, stab)
    const ssrRel = ratio(ssr, sma(ssr, 365))
    const feats: Record<string, Feature> = {
      trend20: trend(price, 20, '20일'),
      trend50: trend(price, 50, '50일'),
      mayer: mayer(price),
      stable14: stableFlow(stab, 14),
      stable30: stableFlow(stab, 30),
      puell: {
        key: 'puell', values: puell, score: (p) => clamp((1.1 - p) / 0.7),
        text: (p) => p < 0.8 ? '채굴자 수입이 평소보다 적어요 — 파는 물량이 줄고 바닥 신호로 보는 구간이에요'
          : p > 1.6 ? '채굴자 수입이 평소보다 많아요 — 채굴자들이 팔기 좋은 때라 매도 물량이 늘 수 있어요'
            : '채굴자 수입이 평소 수준이에요',
      },
      hash: {
        key: 'hash', values: hr, score: (x) => clamp(x / 3),
        text: (x) => x < 0 ? '채굴을 포기하는 채굴자가 늘고 있어요 — 단기적으로 파는 물량이 나올 수 있어요' : '채굴 파워가 늘고 있어요 — 채굴자들이 앞으로를 좋게 보고 있어요',
      },
      nvt: {
        key: 'nvt', values: nvtRel, score: (x) => clamp((1 - x) / 0.35),
        text: (x) => x < 1 ? `실제 쓰이는 돈에 비해 몸값이 1년 평균보다 ${pct(1 - x)} 싸요` : `실제 쓰이는 돈에 비해 몸값이 1년 평균보다 ${pct(x - 1)} 비싸요`,
      },
      active: {
        key: 'active', values: act, score: (x) => clamp(x / 0.15),
        text: (x) => x >= 0 ? `비트코인을 쓰는 사람이 1년 평균보다 ${pct(x)} 많아요` : `비트코인을 쓰는 사람이 1년 평균보다 ${pct(x)} 적어요`,
      },
      ssr: {
        key: 'ssr', values: ssrRel, score: (x) => clamp((1 - x) / 0.35),
        text: (x) => x < 1 ? '비트코인 몸값에 비해 살 돈(달러코인)이 평소보다 넉넉해요' : '비트코인 몸값에 비해 살 돈(달러코인)이 평소보다 부족해요',
      },
    }
    return { start, price, feats }
  }

  const [eth, BTC, S] = await Promise.all([ethDaily(), bci('market-price'), stables()])
  const { start, cols } = align([eth.price, eth.volume, BTC, S])
  const [price, vol, btc, stab] = cols
  const eb = ratio(price, btc)
  const ebRel = ratio(eb, sma(eb, 90)).map((x) => x - 1)
  const volMom = ratio(sma(vol, 30), sma(vol, 365)).map((x) => x - 1)
  const feats: Record<string, Feature> = {
    trend20: trend(price, 20, '20일'),
    trend50: trend(price, 50, '50일'),
    mayer: mayer(price),
    stable14: stableFlow(stab, 14),
    stable30: stableFlow(stab, 30),
    ethbtc: {
      key: 'ethbtc', values: ebRel, score: (x) => clamp(x / 0.1),
      text: (x) => x >= 0 ? `최근 이더리움이 비트코인보다 ${pct(x)} 더 강해요 — 돈이 이더리움으로 오고 있어요` : `최근 이더리움이 비트코인보다 ${pct(x)} 약해요 — 돈이 비트코인 쪽에 머물러요`,
    },
    volume: {
      key: 'volume', values: volMom, score: (x) => clamp(x / 0.4),
      text: (x) => x >= 0 ? `거래량이 1년 평균보다 ${pct(x)} 많아요 — 관심이 늘고 있어요` : `거래량이 1년 평균보다 ${pct(x)} 적어요 — 관심이 식어 있어요`,
    },
  }
  return { start, price, feats }
}

/** 기간별로 어떤 신호를 얼마나 중요하게 볼지 */
const WEIGHTS: Record<Asset, Record<HorizonId, Record<string, number>>> = {
  bitcoin: {
    short: { trend20: 2, trend50: 1, stable14: 1.5, hash: 0.5, active: 0.5 },
    mid: { trend50: 1, mayer: 1.5, puell: 1, nvt: 1, stable30: 1, ssr: 1, hash: 1, active: 0.5 },
    long: { mayer: 2, puell: 1.5, nvt: 1, ssr: 1, active: 0.5, hash: 0.5 },
  },
  ethereum: {
    short: { trend20: 2, trend50: 1, stable14: 1.5, ethbtc: 1, volume: 0.5 },
    mid: { trend50: 1, mayer: 1.5, stable30: 1, ethbtc: 1, volume: 0.5 },
    long: { mayer: 2, ethbtc: 1, stable30: 0.5, volume: 0.5 },
  },
}

function level(p: number): HorizonResult['level'] {
  if (p >= 65) return { label: '높음', tone: 'up' }
  if (p >= 55) return { label: '조금 높음', tone: 'up' }
  if (p > 45) return { label: '반반', tone: 'flat' }
  if (p > 35) return { label: '조금 낮음', tone: 'down' }
  return { label: '낮음', tone: 'down' }
}

export async function fetchOutlook(asset: Asset): Promise<OutlookResult> {
  const { start, price, feats } = await features(asset)
  const L = price.length
  const now = L - 1
  const horizons: HorizonResult[] = HORIZONS.map((h) => {
    const w = WEIGHTS[asset][h.id]
    const keys = Object.keys(w)
    const comp = (t: number) => {
      let s = 0, ws = 0
      for (const k of keys) { const x = feats[k].values[t]; if (!isFinite(x)) return NaN; s += w[k] * feats[k].score(x); ws += w[k] }
      return s / ws
    }
    const S = Array.from({ length: L }, (_, t) => comp(t))
    const sNow = S[now]
    // 과거 날짜 중 기간 뒤 가격을 알 수 있는 날
    const past: { s: number; r: number }[] = []
    for (let t = 0; t + h.days < L; t++) if (isFinite(S[t])) past.push({ s: S[t], r: price[t + h.days] / price[t] - 1 })
    const base = past.length ? past.filter((x) => x.r > 0).length / past.length : 0.5
    // 지금과 점수가 비슷한 날 찾기 (부족하면 범위를 넓힘)
    let band = 0.08, sim = past.filter((x) => Math.abs(x.s - sNow) <= band)
    const need = Math.max(40, Math.round(past.length * 0.08))
    while (sim.length < need && band < 0.6) { band *= 1.4; sim = past.filter((x) => Math.abs(x.s - sNow) <= band) }
    const ups = sim.filter((x) => x.r > 0).length
    // 표본이 적을 때 전체 평균 쪽으로 보정
    const K = 10
    const prob = sim.length ? ((ups + K * base) / (sim.length + K)) * 100 : base * 100
    const rs = sim.map((x) => x.r).sort((a, b) => a - b)
    const typical = rs.length ? rs[Math.floor(rs.length / 2)] * 100 : 0
    const reasons: Reason[] = keys
      .map((k) => { const x = feats[k].values[now]; const sc = feats[k].score(x); return { text: feats[k].text(x), dir: (sc >= 0 ? 1 : -1) as 1 | -1, strength: Math.abs(sc) * w[k], raw: Math.abs(sc) } })
      // 어느 쪽도 아닌 약한 신호는 이유에서 뺌
      .filter((r) => r.raw >= 0.25)
      .map(({ raw: _raw, ...r }) => r)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 4)
    const p = Math.round(prob)
    // 이어진 날들은 결과가 거의 같으므로, 기간(주) 단위로 나눠 실제 사례 수를 어림
    const eff = (sim.length * 7) / h.days
    const trust: HorizonResult['trust'] = eff >= 30 ? '높음' : eff >= 10 ? '보통' : '낮음'
    return { ...h, prob: p, level: level(p), samples: sim.length, ups, typical, base: Math.round(base * 100), trust, reasons }
  })
  return { asset, horizons, from: start * 86400_000, to: (start + L - 1) * 86400_000 }
}
