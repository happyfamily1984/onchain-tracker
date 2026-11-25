/**
 * 도미넌스(시장 비중) — 테더·스테이블코인·비트코인·이더리움이 전체 코인 시장에서 차지하는 비율
 * 현재값: CoinGecko(대체 CoinLore) / 과거: 전체 시가총액(CoinMarketCap, 앱에서만) + 테더 발행량(DefiLlama)
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { stables } from './indicators'
import { sma } from './ta'

export interface DomPoint { t: number; usdt: number; stable: number; btc: number; eth: number; alt: number }

export interface DomItem {
  id: string
  emoji: string
  title: string
  value: string
  change: string | null
  signal: 'buy' | 'sell' | 'neutral'
  say: string
  text: string
  how: string
  key: keyof Omit<DomPoint, 't'>
}

export interface DomResult { now: Omit<DomPoint, 't'>; total: number; history: DomPoint[]; items: DomItem[]; historyNote: string | null }

async function getJSON<T>(url: string): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally { clearTimeout(t) }
}

/** 브라우저 보안 규칙(CORS)을 피해야 하는 요청: 앱에서는 기기에서 직접 요청 */
async function nativeJSON<T>(url: string): Promise<T> {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, connectTimeout: 20000, readTimeout: 20000 })
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
    return (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as T
  }
  return getJSON<T>(url)
}

const day = (sec: number) => Math.floor(sec / 86400)

/** 테더 발행량 일별 기록 (DefiLlama) */
async function usdtHistory(): Promise<Map<number, number>> {
  const j = await getJSON<{ tokens: { date: number; circulating: { peggedUSD: number } }[] }>('https://stablecoins.llama.fi/stablecoin/1')
  const m = new Map<number, number>()
  for (const t of j.tokens) if (t.circulating?.peggedUSD) m.set(day(t.date), t.circulating.peggedUSD)
  return m
}

async function current(): Promise<{ usdt: number; usdc: number; btc: number; eth: number; total: number }> {
  try {
    const g = await getJSON<any>('https://api.coingecko.com/api/v3/global')
    const p = g.data.market_cap_percentage
    return { usdt: p.usdt ?? 0, usdc: p.usdc ?? 0, btc: p.btc, eth: p.eth, total: g.data.total_market_cap.usd }
  } catch {
    const [cl, usdt] = await Promise.all([
      getJSON<any[]>('https://api.coinlore.net/api/global/'),
      usdtHistory(),
    ])
    const total = cl[0].total_mcap
    const u = [...usdt.values()].pop()!
    return { usdt: (u / total) * 100, usdc: 0, btc: +cl[0].btc_d, eth: +cl[0].eth_d, total }
  }
}

async function history(): Promise<DomPoint[]> {
  const end = Math.floor(Date.now() / 1000), start = end - 730 * 86400
  const [cmc, usdt, all] = await Promise.all([
    nativeJSON<any>(`https://api.coinmarketcap.com/data-api/v3/global-metrics/quotes/historical?format=chart&interval=1d&timeStart=${start}&timeEnd=${end}`),
    usdtHistory(),
    stables(),
  ])
  const u = usdt
  const out: DomPoint[] = []
  for (const q of cmc.data.quotes) {
    const d = day(Date.parse(q.timestamp) / 1000)
    const total = q.quote?.[0]?.totalMarketCap
    const ut = u.get(d) ?? u.get(d - 1)
    const st = all.get(d) ?? all.get(d - 1)
    if (!total || !ut || !st) continue
    const usdtD = (ut / total) * 100, stD = (st / total) * 100
    out.push({ t: d * 86400_000, usdt: usdtD, stable: stD, btc: q.btcDominance, eth: q.ethDominance, alt: 100 - q.btcDominance - stD })
  }
  return out
}

const pp = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%p`

export async function fetchDominance(): Promise<DomResult> {
  const [cur, hist] = await Promise.all([current(), history().catch(() => [] as DomPoint[])])
  // 현재값: 공식 비중 사용, 스테이블 전체는 발행량으로 계산
  let stableNow = cur.usdt + cur.usdc
  try { const s = await stables(); const v = [...s.values()].pop(); if (v) stableNow = (v / cur.total) * 100 } catch { /* 공식 비중 사용 */ }
  const now = { usdt: cur.usdt, stable: stableNow, btc: cur.btc, eth: cur.eth, alt: 100 - cur.btc - stableNow }
  const has = hist.length > 60
  const ago = (k: keyof Omit<DomPoint, 't'>, days: number) => (has ? hist[Math.max(0, hist.length - 1 - days)][k] : NaN)
  const ch = (k: keyof Omit<DomPoint, 't'>, days = 30) => (has ? now[k] - ago(k, days) : NaN)
  const maOf = (k: keyof Omit<DomPoint, 't'>, n: number) => { if (!has) return NaN; const v = sma(hist.map((p) => p[k]), n); return v[v.length - 1] }
  const items: DomItem[] = []

  // 테더 도미넌스
  {
    const c30 = ch('usdt'), m50 = maOf('usdt', 50)
    const rising = has ? c30 > 0.15 : false, falling = has ? c30 < -0.15 : false
    const above = isFinite(m50) ? now.usdt > m50 : null
    items.push({
      id: 'usdt', key: 'usdt', emoji: '💵', title: '테더 도미넌스 (USDT.D)', value: `${now.usdt.toFixed(2)}%`,
      change: has ? `30일 ${pp(c30)}` : null,
      signal: rising ? 'sell' : falling ? 'buy' : 'neutral',
      say: rising ? '⚠️ 사람들이 코인을 팔고 현금(테더)으로 피하고 있어요' : falling ? '👍 현금(테더)이 코인으로 옮겨 가고 있어요' : '😐 큰 변화가 없어요',
      text: `전체 코인 시장에서 테더가 차지하는 비중이 ${now.usdt.toFixed(2)}%예요. ${has ? `한 달 전보다 ${pp(c30)} ${c30 >= 0 ? '올랐어요' : '내렸어요'}. ` : ''}${rising ? '코인값이 떨어지거나 사람들이 코인을 팔아 현금으로 바꿀 때 오르는 지표라, 시장에 겁이 많다는 뜻이에요.' : falling ? '사람들이 현금을 꺼내 코인을 사고 있다는 뜻이라, 코인 시장에 좋은 신호예요.' : '시장이 한쪽으로 쏠리지 않았어요.'}${above != null ? ` 50일 평균선보다 ${above ? '위에 있어 아직 조심스러운 흐름' : '아래에 있어 코인에 유리한 흐름'}이에요.` : ''}`,
      how: '테더 도미넌스는 코인 시장의 “현금 비중”이에요. 코인값과 반대로 움직이는 경우가 많아서, 많은 투자자가 비트코인 차트를 뒤집어 본 것처럼 참고해요. 오르면 코인에 나쁜 신호, 내리면 좋은 신호예요.',
    })
  }

  // 스테이블코인 전체 도미넌스
  {
    const c30 = ch('stable')
    items.push({
      id: 'stable', key: 'stable', emoji: '🏦', title: '스테이블코인 전체 비중', value: `${now.stable.toFixed(2)}%`,
      change: has ? `30일 ${pp(c30)}` : null,
      signal: has ? (c30 > 0.2 ? 'sell' : c30 < -0.2 ? 'buy' : 'neutral') : 'neutral',
      say: has ? (c30 > 0.2 ? '⚠️ 현금 비중이 늘고 있어요' : c30 < -0.2 ? '👍 현금이 코인으로 들어가고 있어요' : '😐 현금 비중이 비슷해요') : '😐 현재 현금 비중이에요',
      text: `테더·USDC 등 모든 달러코인을 합치면 전체 코인 시장의 ${now.stable.toFixed(2)}%예요. 이 비중이 높다는 건 시장에 “언제든 코인을 살 수 있는 대기 현금”이 많다는 뜻이기도 해요.`,
      how: '스테이블코인 비중이 갑자기 오르면 사람들이 코인을 팔고 현금으로 피하는 중이고, 높은 상태에서 내려가기 시작하면 대기 현금이 코인 매수에 쓰이고 있다는 뜻이에요.',
    })
  }

  // 비트코인 도미넌스
  {
    const c30 = ch('btc')
    // 비트코인 비중이 줄었는데 달러코인 비중이 늘었다면 알트 시즌이 아니라 현금으로 피하는 중
    const toCash = has && c30 < -0.5 && ch('stable') > 0.5
    items.push({
      id: 'btc', key: 'btc', emoji: '🟠', title: '비트코인 도미넌스 (BTC.D)', value: `${now.btc.toFixed(2)}%`,
      change: has ? `30일 ${pp(c30)}` : null,
      signal: 'neutral',
      say: has ? (c30 > 0.5 ? '🟠 돈이 비트코인으로 몰리고 있어요' : toCash ? '💵 비트코인에서 현금(달러코인)으로 빠지고 있어요' : c30 < -0.5 ? '🌈 돈이 알트코인으로 퍼지고 있어요' : '😐 비트코인 비중이 비슷해요') : '🟠 비트코인이 시장의 절반 이상이에요',
      text: `비트코인이 전체 코인 시장의 ${now.btc.toFixed(1)}%를 차지해요. ${has ? (c30 > 0.5 ? '비트코인 비중이 오르는 중이라, 불안할 때 가장 안전한 코인으로 돈이 모이거나 비트코인이 시장을 이끄는 상황이에요.' : toCash ? `비트코인 비중이 ${pp(c30)} 줄었지만, 같은 기간 달러코인 비중이 ${pp(ch('stable'))} 늘었어요. 알트코인으로 간 게 아니라 코인을 팔고 현금으로 피하는 중이라는 뜻이에요.` : c30 < -0.5 ? '비트코인 비중이 내리는 중이라, 이더리움·알트코인이 상대적으로 강한 “알트 시즌” 쪽으로 가고 있어요.' : '비중 변화가 작아요.') : ''}`,
      how: '비트코인 도미넌스가 오르면 돈이 비트코인으로 모이는 중(알트코인은 상대적으로 약함), 내리면 다른 코인으로 퍼지는 중(알트 시즌)이에요. 비트코인 가격과 함께 보면 더 정확해요.',
    })
  }

  // 이더리움 도미넌스
  {
    const c30 = ch('eth')
    items.push({
      id: 'eth', key: 'eth', emoji: '💠', title: '이더리움 도미넌스 (ETH.D)', value: `${now.eth.toFixed(2)}%`,
      change: has ? `30일 ${pp(c30)}` : null,
      signal: has ? (c30 > 0.3 ? 'buy' : c30 < -0.3 ? 'sell' : 'neutral') : 'neutral',
      say: has ? (c30 > 0.3 ? '💠 이더리움이 시장보다 강해요' : c30 < -0.3 ? '🙁 이더리움이 시장보다 약해요' : '😐 이더리움 비중이 비슷해요') : '💠 이더리움 현재 비중이에요',
      text: `이더리움이 전체 코인 시장의 ${now.eth.toFixed(1)}%를 차지해요.${has ? ` 한 달 동안 ${pp(c30)} 변했어요.` : ''}`,
      how: '이더리움 비중이 오르면 이더리움이 다른 코인보다 많이 오르거나 덜 떨어지고 있다는 뜻이에요. 보통 알트코인 상승장의 출발 신호로 봐요.',
    })
  }

  // 알트코인 비중
  {
    const c30 = ch('alt')
    items.push({
      id: 'alt', key: 'alt', emoji: '🌈', title: '알트코인 비중', value: `${now.alt.toFixed(1)}%`,
      change: has ? `30일 ${pp(c30)}` : null,
      signal: has ? (c30 > 0.5 ? 'buy' : c30 < -0.5 ? 'sell' : 'neutral') : 'neutral',
      say: has ? (c30 > 0.5 ? '🌈 알트코인으로 돈이 들어오고 있어요' : c30 < -0.5 ? '🙁 알트코인에서 돈이 빠지고 있어요' : '😐 알트코인 비중이 비슷해요') : '🌈 비트코인·달러코인을 뺀 나머지 비중이에요',
      text: `비트코인과 달러코인을 뺀 나머지 코인(이더리움 포함)의 비중이 ${now.alt.toFixed(1)}%예요.`,
      how: '알트코인 비중이 크게 오르는 시기를 “알트 시즌”이라고 불러요. 보통 비트코인이 먼저 오른 뒤, 돈이 이더리움 → 다른 알트코인 순으로 퍼져요.',
    })
  }

  return {
    now, total: cur.total, history: hist, items,
    historyNote: has ? null : '과거 기록(차트)은 휴대폰 앱에서만 볼 수 있어요. 지금은 현재값만 보여드려요.',
  }
}
