/**
 * 온체인 분석 지표 — "숫자가 무슨 뜻인지"를 함께 계산한다.
 * 데이터: blockchain.com 차트(5년 일별), DefiLlama 스테이블코인, Blockchair·Blockscout
 */
import type { Point } from './api'
import { money } from './format'

export type Tone = 'cold' | 'cool' | 'neutral' | 'warm' | 'hot' | 'info'
export interface Zone {
  to: number
  /** 구간 이름 (쉬운 말) */
  label: string
  tone: Tone
  /** 한 줄 결론: 그래서 어떻다는 건지 */
  say: string
  /** 조금 더 자세한 쉬운 설명 */
  text: string
}

export interface Indicator {
  id: string
  group: 'value' | 'miner' | 'network' | 'flow' | 'eth'
  emoji: string
  /** 쉬운 우리말 제목 */
  title: string
  /** 원래 전문 용어 */
  tech: string
  /** 이게 뭔지 한 줄 */
  easy: string
  /** 비유로 설명 */
  analogy: string
  /** 게이지 양 끝 의미 */
  ends: [string, string]
  value: number
  display: string
  /** 게이지 위치 계산용 값 (기본: value) */
  gauge?: number
  gaugeMin: number
  gaugeMax: number
  zones: Zone[]
  zone: Zone
  how: string
  why: string
  history?: string
  series?: Point[]
  seriesFmt?: (v: number) => string
  refs?: number[]
  /** 시장 온도 계산용 0~100 (낮을수록 저평가) */
  score?: number
}

export const TONE_COLOR: Record<Tone, string> = {
  cold: '#3b82f6', cool: '#38bdf8', neutral: '#a3adc2', warm: '#f59e0b', hot: '#ef4444', info: '#8c8cff',
}

// ───── 데이터 ─────
type Series = Map<number, number> // dayIndex → value
const day = (sec: number) => Math.floor(sec / 86400)

async function getJSON<T>(url: string): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 30000)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally { clearTimeout(t) }
}

async function bci(metric: string): Promise<Series> {
  const r = await getJSON<{ values: { x: number; y: number }[] }>(`https://api.blockchain.info/charts/${metric}?timespan=5years&format=json&cors=true&sampled=true`)
  const m: Series = new Map()
  for (const p of r.values) if (isFinite(p.y)) m.set(day(p.x), p.y)
  return m
}

async function stables(): Promise<Series> {
  const r = await getJSON<{ date: string; totalCirculatingUSD: { peggedUSD: number } }[]>('https://stablecoins.llama.fi/stablecoincharts/all')
  const m: Series = new Map()
  for (const p of r) m.set(day(Number(p.date)), p.totalCirculatingUSD?.peggedUSD ?? NaN)
  return m
}

/** 빈 날을 이전 값으로 채운 연속 일별 배열 */
function dense(s: Series): { start: number; v: number[] } {
  const keys = [...s.keys()].sort((a, b) => a - b)
  const start = keys[0], end = keys[keys.length - 1]
  const v: number[] = []
  let last = s.get(start)!
  for (let d = start; d <= end; d++) { const x = s.get(d); if (x != null && isFinite(x)) last = x; v.push(last) }
  return { start, v }
}

function sma(v: number[], n: number): number[] {
  const out: number[] = new Array(v.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < v.length; i++) {
    sum += v[i]
    if (i >= n) sum -= v[i - n]
    if (i >= n - 1) out[i] = sum / n
  }
  return out
}

const toPoints = (start: number, v: number[], lastDays = 365): Point[] =>
  v.map((x, i) => ({ t: (start + i) * 86400_000, v: x })).filter((p) => isFinite(p.v)).slice(-lastDays)

function percentile(hist: number[], x: number) {
  const h = hist.filter(isFinite)
  if (!h.length) return 50
  return (h.filter((y) => y < x).length / h.length) * 100
}

const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x))
const lin = (x: number, lo: number, hi: number) => clamp(((x - lo) / (hi - lo)) * 100)
const zoneOf = (zones: Zone[], x: number) => zones.find((z) => x < z.to) ?? zones[zones.length - 1]
const f2 = (x: number) => x.toFixed(2)
const pctS = (x: number, d = 1) => (x > 0 ? '+' : '') + x.toFixed(d) + '%'

export interface IndicatorResult {
  list: Indicator[]
  temperature: { score: number; label: string; tone: Tone; say: string; text: string; parts: { title: string; score: number }[] }
  updated: number
}

export async function fetchIndicators(eth: { burned24h: number | null; circulation: number | null; utilization: number | null }): Promise<IndicatorResult> {
  const [price, rev, hash, fees, vol, addr, mcap, supply, stab] = await Promise.all([
    bci('market-price'), bci('miners-revenue'), bci('hash-rate'), bci('transaction-fees-usd'),
    bci('estimated-transaction-volume-usd'), bci('n-unique-addresses'), bci('market-cap'), bci('total-bitcoins'),
    stables().catch(() => null),
  ])
  const list: Indicator[] = []

  // ── 1. 200일 평균 대비 가격 (메이어 멀티플) ──
  {
    const P = dense(price), ma = sma(P.v, 200)
    const ratio = P.v.map((x, i) => x / ma[i])
    const v = ratio[ratio.length - 1]
    const avg = ma[ma.length - 1]
    const zones: Zone[] = [
      { to: 0.8, label: '많이 쌈', tone: 'cold', say: '👍 평소보다 많이 싸요', text: '지금 가격이 최근 200일 평균보다 20% 넘게 낮아요. 예전에도 이럴 때 사 둔 사람들이 나중에 웃은 경우가 많았어요.' },
      { to: 1.0, label: '조금 쌈', tone: 'cool', say: '🙂 평소보다 조금 싸요', text: '가격이 200일 평균보다 아래예요. 분위기는 안 좋지만 바닥을 다지는 중일 수 있어요.' },
      { to: 1.5, label: '보통', tone: 'neutral', say: '😐 평소 수준이에요', text: '가격이 200일 평균과 비슷하거나 조금 위예요. 너무 비싸지도 싸지도 않아요.' },
      { to: 2.4, label: '비싼 편', tone: 'warm', say: '⚠️ 평소보다 꽤 비싸요', text: '가격이 평균보다 많이 올랐어요. 오르는 중이지만, 높아질수록 급락 위험도 커져요.' },
      { to: Infinity, label: '너무 비쌈', tone: 'hot', say: '🔥 과열! 조심하세요', text: '가격이 평균의 2.4배가 넘어요. 예전 최고점들이 대부분 이 구간에서 나왔어요.' },
    ]
    list.push({
      id: 'mayer', group: 'value', emoji: '📏', title: '평소 가격과 비교하면?', tech: '메이어 멀티플',
      easy: '지금 가격이 최근 200일(약 7개월) 평균 가격의 몇 배인지',
      analogy: '자주 가는 가게 물건값이 평소보다 비싼지 싼지 보는 것과 같아요.',
      ends: ['쌈', '비쌈'],
      value: v, display: f2(v) + '배', gaugeMin: 0.4, gaugeMax: 3, zones, zone: zoneOf(zones, v),
      how: `현재 가격 ÷ 200일 평균 가격 ($${Math.round(avg).toLocaleString()}). 1배면 평균과 같아요.`,
      why: '가격은 평균에서 너무 멀어지면 다시 돌아오려는 성질이 있어요. 평균보다 너무 높으면 내려올 위험, 너무 낮으면 오를 여지가 커요.',
      history: '2017·2021년 최고점 때는 2.4배를 넘었고, 2018·2022년 바닥 때는 0.8배 아래였어요.',
      series: toPoints(P.start, ratio), seriesFmt: (x) => f2(x) + '배', refs: [0.8, 1, 2.4],
      score: lin(v, 0.6, 2.4),
    })
  }

  // ── 2. 4년 평균 대비 가격 (200주 이동평균) ──
  {
    const P = dense(price), ma = sma(P.v, 1400)
    const ratio = P.v.map((x, i) => x / ma[i])
    const v = ratio[ratio.length - 1]
    if (isFinite(v)) {
      const zones: Zone[] = [
        { to: 1.0, label: '역사적 바닥', tone: 'cold', say: '👍 역대급으로 싼 구간', text: '가격이 4년 평균보다도 낮아요. 비트코인 역사에서 몇 번 없던 아주 싼 시기예요.' },
        { to: 1.5, label: '싼 편', tone: 'cool', say: '🙂 길게 보면 싼 편', text: '4년 평균과 가까워요. 길게 보면 아직 싼 가격이에요.' },
        { to: 2.5, label: '보통', tone: 'neutral', say: '😐 적당한 수준', text: '4년 평균보다 적당히 위에 있어요.' },
        { to: 4, label: '비싼 편', tone: 'warm', say: '⚠️ 상승장 후반 느낌', text: '4년 평균보다 크게 높아요. 상승장이 꽤 진행됐을 때 보이는 수준이에요.' },
        { to: Infinity, label: '과열', tone: 'hot', say: '🔥 역대 고점 수준', text: '4년 평균의 4배 이상이에요. 예전 최고점 수준이에요.' },
      ]
      list.push({
        id: 'wma200', group: 'value', emoji: '🧱', title: '4년 평균과 비교하면?', tech: '200주 이동평균',
        easy: '지금 가격이 지난 4년(200주) 평균 가격의 몇 배인지',
        analogy: '집값을 볼 때 최근 몇 달이 아니라 4년 평균과 비교하는 것처럼, 큰 흐름에서 싼지 비싼지 봐요.',
        ends: ['쌈', '비쌈'],
        value: v, display: f2(v) + '배', gaugeMin: 0.6, gaugeMax: 5, zones, zone: zoneOf(zones, v),
        how: `현재 가격 ÷ 지난 200주 평균 가격 ($${Math.round(ma[ma.length - 1]).toLocaleString()})`,
        why: '비트코인은 약 4년마다 오르고 내리는 사이클이 있어요. 4년 평균선은 하락장에서도 거의 깨지지 않아 “최후의 바닥선”이라고 불려요.',
        history: '2015·2018·2022년 바닥 때 가격이 이 선 근처까지 내려왔다가 다시 올랐어요.',
        series: toPoints(P.start, ratio), seriesFmt: (x) => f2(x) + '배', refs: [1, 2.5],
        score: lin(v, 0.8, 4),
      })
    }
  }

  // ── 3. 사용량 대비 몸값 (NVT) ──
  {
    const M = dense(mcap), V = dense(vol)
    const vma = sma(V.v, 90)
    const nvt: number[] = []
    const startD = Math.max(M.start, V.start)
    for (let d = startD; d < M.start + M.v.length && d < V.start + V.v.length; d++) nvt.push(M.v[d - M.start] / vma[d - V.start])
    const v = nvt[nvt.length - 1]
    const pct = percentile(nvt, v)
    const zones: Zone[] = [
      { to: 20, label: '쌈', tone: 'cold', say: '👍 쓰임새에 비해 싸요', text: '비트코인으로 실제 오가는 돈에 비해 전체 몸값(시가총액)이 낮아요. 실속 대비 저렴해요.' },
      { to: 40, label: '조금 쌈', tone: 'cool', say: '🙂 조금 싼 편', text: '실제 사용량에 비해 몸값이 무난하거나 조금 싸요.' },
      { to: 60, label: '보통', tone: 'neutral', say: '😐 적당해요', text: '몸값과 실제 사용량이 균형을 이루고 있어요.' },
      { to: 80, label: '비싼 편', tone: 'warm', say: '⚠️ 기대감이 앞서가요', text: '실제 쓰이는 것보다 가격이 앞서가요. 기대가 많이 반영된 상태예요.' },
      { to: Infinity, label: '너무 비쌈', tone: 'hot', say: '🔥 거품 주의', text: '쓰임새에 비해 몸값이 지난 5년 중 가장 비싼 수준이에요.' },
    ]
    list.push({
      id: 'nvt', group: 'value', emoji: '⚖️', title: '쓰임새에 비해 비싼가?', tech: 'NVT 시그널',
      easy: '비트코인으로 실제 오가는 돈에 비해 몸값(시가총액)이 비싼지',
      analogy: '가게의 매출에 비해 가게 값이 비싼지 보는 것과 같아요. 주식의 PER과 비슷해요.',
      ends: ['쌈', '비쌈'],
      value: v, display: v.toFixed(0), gauge: pct, gaugeMin: 0, gaugeMax: 100, zones, zone: zoneOf(zones, pct),
      how: `시가총액 ÷ 최근 90일 하루 평균 전송액. 지난 5년 기록과 비교해 100명 중 ${Math.round(pct)}등 정도로 비싸요(낮을수록 쌈).`,
      why: '사람들이 많이 쓰는데 가격이 낮으면 저평가, 별로 안 쓰는데 가격만 높으면 거품일 수 있어요.',
      series: toPoints(startD, nvt), seriesFmt: (x) => x.toFixed(0),
      score: pct,
    })
  }

  // ── 4. 채굴자 수입 (퍼엘 멀티플) ──
  {
    const R = dense(rev), r7 = sma(R.v, 7), r365 = sma(R.v, 365)
    const puell = R.v.map((_, i) => r7[i] / r365[i])
    const v = puell[puell.length - 1]
    const zones: Zone[] = [
      { to: 0.5, label: '최악', tone: 'cold', say: '👍 바닥 신호일 수 있어요', text: '채굴자 수입이 평소의 절반도 안 돼요. 채굴자들이 가장 힘든 시기인데, 예전엔 이때가 바닥이었어요.' },
      { to: 0.8, label: '적음', tone: 'cool', say: '🙂 채굴자들이 힘든 편', text: '채굴자 수입이 평소보다 적어요. 팔 코인도 줄어 시장에 나오는 물량이 적어져요.' },
      { to: 1.5, label: '보통', tone: 'neutral', say: '😐 평소 수준', text: '채굴자 수입이 1년 평균 수준이에요.' },
      { to: 3, label: '많음', tone: 'warm', say: '⚠️ 채굴자들이 팔기 좋은 때', text: '채굴자 수입이 평소보다 많아요. 채굴자들이 코인을 팔아 이익을 챙기기 좋은 환경이에요.' },
      { to: Infinity, label: '과열', tone: 'hot', say: '🔥 고점 신호', text: '채굴자 수입이 평소의 3배가 넘어요. 예전 최고점 때 나타났던 수준이에요.' },
    ]
    list.push({
      id: 'puell', group: 'miner', emoji: '⛏️', title: '채굴자들 벌이는 어떤가?', tech: '퍼엘 멀티플',
      easy: '채굴자들이 요즘 평소보다 돈을 많이 버는지, 적게 버는지',
      analogy: '광부들의 월급이 평소보다 많은지 적은지 보는 거예요. 월급이 적으면 힘들어하고, 많으면 금을 내다 팔아요.',
      ends: ['적게 범', '많이 범'],
      value: v, display: f2(v) + '배', gaugeMin: 0.2, gaugeMax: 4, zones, zone: zoneOf(zones, v),
      how: '최근 7일 하루 평균 채굴 수입 ÷ 1년 하루 평균 채굴 수입',
      why: '채굴자는 새로 캔 코인을 꾸준히 파는, 시장의 대표적인 “파는 사람”이에요. 이들의 형편을 보면 파는 물량이 많아질지 알 수 있어요.',
      history: '0.5배 아래는 2018·2022년 바닥, 4배 위는 2017·2021년 최고점 무렵이었어요.',
      series: toPoints(R.start, puell), seriesFmt: (x) => f2(x) + '배', refs: [0.5, 1, 3],
      score: lin(v, 0.4, 3),
    })
  }

  // ── 5. 채굴자 버티기 (해시 리본) ──
  {
    const H = dense(hash), m30 = sma(H.v, 30), m60 = sma(H.v, 60)
    const ratio = H.v.map((_, i) => (m30[i] / m60[i] - 1) * 100)
    const v = ratio[ratio.length - 1]
    let crossedUp = -1
    for (let i = ratio.length - 1; i > ratio.length - 30; i--) if (ratio[i] >= 0 && ratio[i - 1] < 0) { crossedUp = ratio.length - 1 - i; break }
    const zones: Zone[] = [
      { to: 0, label: '포기하는 중', tone: 'cool', say: '😣 채굴자들이 포기하는 중', text: '돈이 안 돼서 채굴을 멈추는 채굴자가 늘고 있어요. 이들이 코인을 팔아 잠깐 힘들 수 있지만, 이게 끝나면 바닥인 경우가 많았어요.' },
      { to: Infinity, label: crossedUp >= 0 ? '회복 시작' : '튼튼함', tone: crossedUp >= 0 ? 'cold' : 'neutral',
        say: crossedUp >= 0 ? '👍 유명한 “매수 신호” 발생' : '😐 채굴자들 튼튼해요',
        text: crossedUp >= 0 ? `${crossedUp}일 전 채굴자들의 포기가 끝나고 다시 늘기 시작했어요. 이 지표에서 가장 유명한 매수 신호예요.` : '채굴하는 사람이 꾸준히 늘고 있어요. 채굴 업계가 건강해요.' },
    ]
    list.push({
      id: 'hashribbon', group: 'miner', emoji: '🎗️', title: '채굴자들이 버티고 있나?', tech: '해시 리본',
      easy: '채굴하는 힘(해시레이트)이 늘고 있는지, 채굴을 포기하는 사람이 많은지',
      analogy: '장사가 안 돼서 가게 문을 닫는 사람이 늘고 있는지 보는 것과 같아요.',
      ends: ['포기', '늘어남'],
      value: v, display: pctS(v, 2), gaugeMin: -8, gaugeMax: 8, zones, zone: zoneOf(zones, v),
      how: '최근 30일 평균 채굴 파워 ÷ 최근 60일 평균 − 1 (마이너스면 줄어드는 중)',
      why: '채굴자들이 포기할 땐 가진 코인을 팔아 가격이 눌리지만, 포기가 끝나는 시점은 예전부터 좋은 매수 타이밍이었어요.',
      history: '2018년 12월, 2020년 3월, 2022년 말에 포기가 끝난 뒤 가격이 올랐어요.',
      series: toPoints(H.start, ratio), seriesFmt: (x) => pctS(x, 2), refs: [0],
    })
  }

  // ── 6. 사용자 수 변화 ──
  {
    const A = dense(addr), a30 = sma(A.v, 30), a365 = sma(A.v, 365)
    const mom = A.v.map((_, i) => (a30[i] / a365[i] - 1) * 100)
    const v = mom[mom.length - 1]
    const zones: Zone[] = [
      { to: -15, label: '크게 줄어듦', tone: 'cool', say: '😴 관심이 많이 식었어요', text: '비트코인을 쓰는 사람이 1년 평균보다 크게 줄었어요.' },
      { to: -5, label: '줄어듦', tone: 'cool', say: '🙁 사용자가 줄고 있어요', text: '쓰는 사람이 평소보다 조금 줄었어요.' },
      { to: 5, label: '비슷함', tone: 'neutral', say: '😐 평소와 비슷해요', text: '쓰는 사람 수가 1년 평균과 비슷해요.' },
      { to: 15, label: '늘어남', tone: 'warm', say: '📈 사용자가 늘고 있어요', text: '비트코인을 쓰는 사람이 늘고 있어요. 수요가 살아나는 좋은 신호예요.' },
      { to: Infinity, label: '급증', tone: 'hot', say: '🚀 사람들이 몰려와요', text: '쓰는 사람이 크게 늘었어요. 새로운 사람들이 몰려드는 상승장의 특징이에요.' },
    ]
    list.push({
      id: 'active', group: 'network', emoji: '👥', title: '쓰는 사람이 늘고 있나?', tech: '활성 주소',
      easy: '하루에 실제로 코인을 주고받은 지갑 수가 평소보다 많은지',
      analogy: '가게에 오는 손님 수가 늘었는지 보는 거예요.',
      ends: ['줄어듦', '늘어남'],
      value: v, display: pctS(v), gaugeMin: -30, gaugeMax: 30, zones, zone: zoneOf(zones, v),
      how: `최근 30일 하루 평균 사용 지갑 수(${Math.round(a30[a30.length - 1]).toLocaleString()}개)를 1년 평균과 비교`,
      why: '가격은 결국 쓰는 사람이 늘어야 오래 오를 수 있어요. 가격은 오르는데 사용자가 줄면 힘이 약한 상승일 수 있어요.',
      series: toPoints(A.start, mom), seriesFmt: (x) => pctS(x), refs: [0],
    })
  }

  // ── 7. 오가는 돈의 양 ──
  {
    const V = dense(vol), v30 = sma(V.v, 30), v365 = sma(V.v, 365)
    const mom = V.v.map((_, i) => (v30[i] / v365[i] - 1) * 100)
    const v = mom[mom.length - 1]
    const zones: Zone[] = [
      { to: -20, label: '크게 줄어듦', tone: 'cool', say: '😴 거래가 뜸해요', text: '비트코인으로 오가는 돈이 1년 평균보다 크게 줄었어요.' },
      { to: -5, label: '줄어듦', tone: 'cool', say: '🙁 평소보다 조용해요', text: '오가는 돈이 평소보다 조금 적어요.' },
      { to: 5, label: '비슷함', tone: 'neutral', say: '😐 평소와 비슷해요', text: '오가는 돈이 평소 수준이에요.' },
      { to: 25, label: '활발함', tone: 'warm', say: '📈 돈이 활발히 오가요', text: '비트코인으로 오가는 돈이 늘고 있어요. 경제 활동이 활발해요.' },
      { to: Infinity, label: '매우 활발', tone: 'hot', say: '🚀 큰돈이 많이 움직여요', text: '오가는 돈이 크게 늘었어요. 큰손들이 많이 움직이고 있어요.' },
    ]
    list.push({
      id: 'volume', group: 'network', emoji: '💸', title: '오가는 돈이 많아졌나?', tech: '온체인 전송액',
      easy: '하루에 비트코인으로 주고받은 금액이 평소보다 많은지',
      analogy: '시장 바닥에서 오가는 돈의 양이에요. 많을수록 장이 활발해요.',
      ends: ['조용함', '활발함'],
      value: v, display: pctS(v), gaugeMin: -40, gaugeMax: 40, zones, zone: zoneOf(zones, v),
      how: '최근 30일 하루 평균 전송 금액을 1년 평균과 비교',
      why: '실제 경제 활동의 크기예요. 가격과 함께 늘면 튼튼한 상승이에요.',
      series: toPoints(V.start, mom), seriesFmt: (x) => pctS(x), refs: [0],
    })
  }

  // ── 8. 수수료 경쟁 ──
  {
    const F = dense(fees), R = dense(rev)
    const f30 = sma(F.v, 30), r30 = sma(R.v, 30)
    const off = F.start - R.start
    const share = F.v.map((_, i) => (f30[i] / r30[i + off]) * 100)
    const v = share[share.length - 1]
    const zones: Zone[] = [
      { to: 2, label: '한산함', tone: 'cool', say: '🟢 송금하기 좋은 때', text: '수수료 경쟁이 거의 없어요. 지금 보내면 싸게 보낼 수 있지만, 그만큼 쓰는 사람이 적다는 뜻이기도 해요.' },
      { to: 5, label: '보통', tone: 'neutral', say: '😐 평소 수준', text: '수수료가 적당해요.' },
      { to: 15, label: '붐빔', tone: 'warm', say: '🟠 서로 먼저 보내려 해요', text: '빨리 처리되려고 수수료를 더 내는 사람이 많아요. 사용 수요가 많아요.' },
      { to: Infinity, label: '매우 붐빔', tone: 'hot', say: '🔴 수수료가 비싸요', text: '수수료가 아주 비싸요. 투기 열풍이나 급하게 사고파는 사람이 몰린 상태일 수 있어요.' },
    ]
    list.push({
      id: 'feeshare', group: 'network', emoji: '🧾', title: '수수료 경쟁이 치열한가?', tech: '수수료 비중',
      easy: '채굴자 수입 중 사람들이 낸 수수료가 차지하는 비율',
      analogy: '택시 잡기가 어려울 때 웃돈을 얹어 주는 것처럼, 붐빌수록 수수료가 올라가요.',
      ends: ['한산', '붐빔'],
      value: v, display: v.toFixed(1) + '%', gaugeMin: 0, gaugeMax: 20, zones, zone: zoneOf(zones, v),
      how: '최근 30일 수수료 합계 ÷ 최근 30일 채굴 수입 전체',
      why: '수수료는 사람들이 진짜로 비트코인을 쓰고 싶어 하는 정도를 보여줘요. 채굴 보상은 4년마다 반으로 줄기 때문에, 앞으로는 수수료가 네트워크를 지켜야 해요.',
      series: toPoints(F.start, share), seriesFmt: (x) => x.toFixed(1) + '%',
    })
  }

  // ── 9. 대기 자금 & 10. 살 돈은 충분한가 ──
  if (stab && stab.size > 400) {
    const S = dense(stab)
    const ch = S.v.map((x, i) => (i >= 30 ? (x / S.v[i - 30] - 1) * 100 : NaN))
    const v = ch[ch.length - 1]
    const zones: Zone[] = [
      { to: -2, label: '빠져나감', tone: 'hot', say: '💸 시장에서 돈이 빠져요', text: '코인 시장의 “현금”인 달러코인이 줄고 있어요. 돈이 시장을 떠나는 중이에요.' },
      { to: 0, label: '정체', tone: 'cool', say: '😐 새 돈이 안 들어와요', text: '대기 자금이 늘지 않고 있어요.' },
      { to: 2, label: '조금 들어옴', tone: 'neutral', say: '🙂 조금씩 들어와요', text: '새로운 돈이 천천히 들어오고 있어요.' },
      { to: 5, label: '들어옴', tone: 'warm', say: '📈 살 돈이 쌓이고 있어요', text: '코인을 살 수 있는 대기 자금이 빠르게 늘고 있어요. 상승의 연료가 쌓이는 중이에요.' },
      { to: Infinity, label: '많이 들어옴', tone: 'hot', say: '🚀 큰돈이 들어오는 중', text: '달러코인이 크게 늘었어요. 새로운 큰돈이 시장에 들어오고 있어요.' },
    ]
    list.push({
      id: 'stable', group: 'flow', emoji: '💵', title: '시장에 돈이 들어오나?', tech: '스테이블코인 공급',
      easy: '코인 시장의 현금 역할을 하는 달러코인(USDT·USDC)이 늘고 있는지',
      analogy: '시장 입구에 지갑을 든 손님이 늘어나는지 보는 거예요. 달러코인이 늘면 코인을 살 돈이 준비된 거예요.',
      ends: ['빠져나감', '들어옴'],
      value: v, display: pctS(v, 2), gaugeMin: -6, gaugeMax: 8, zones, zone: zoneOf(zones, v),
      how: `달러코인 전체 발행액의 30일 변화율 (현재 약 ${money(S.v[S.v.length - 1], { compact: true })})`,
      why: '사람들은 코인을 사기 전에 보통 달러코인으로 바꿔 둬요. 그래서 달러코인이 늘면 곧 코인을 살 돈이 많다는 뜻이에요.',
      series: toPoints(S.start, ch), seriesFmt: (x) => pctS(x, 2), refs: [0],
    })

    const M = dense(mcap)
    const ssr: number[] = []
    const st = Math.max(M.start, S.start)
    for (let d = st; d < M.start + M.v.length && d < S.start + S.v.length; d++) ssr.push(M.v[d - M.start] / S.v[d - S.start])
    const sv = ssr[ssr.length - 1]
    const pct = percentile(ssr, sv)
    const z2: Zone[] = [
      { to: 20, label: '아주 넉넉', tone: 'cold', say: '👍 살 돈이 아주 많아요', text: '비트코인 규모에 비해 대기 현금이 아주 많아요. 언제든 사러 들어올 돈이 충분해요.' },
      { to: 40, label: '넉넉', tone: 'cool', say: '🙂 살 돈이 넉넉해요', text: '비트코인 규모에 비해 대기 현금이 넉넉한 편이에요.' },
      { to: 60, label: '보통', tone: 'neutral', say: '😐 평소 수준', text: '비트코인과 대기 현금의 비율이 평균적이에요.' },
      { to: 80, label: '부족', tone: 'warm', say: '⚠️ 살 돈이 부족한 편', text: '비트코인 규모에 비해 대기 현금이 적어요. 더 오를 연료가 부족할 수 있어요.' },
      { to: Infinity, label: '많이 부족', tone: 'hot', say: '🔥 살 돈이 바닥났어요', text: '대기 현금이 비트코인 규모에 비해 5년 중 가장 적은 수준이에요.' },
    ]
    list.push({
      id: 'ssr', group: 'flow', emoji: '🔋', title: '비트코인을 살 돈은 충분한가?', tech: 'SSR (스테이블코인 공급 비율)',
      easy: '비트코인 전체 몸값에 비해 대기 중인 현금(달러코인)이 얼마나 되는지',
      analogy: '경매장에 나온 물건값에 비해 손님들 지갑이 얼마나 두둑한지 보는 거예요.',
      ends: ['넉넉함', '부족함'],
      value: sv, display: sv.toFixed(2), gauge: pct, gaugeMin: 0, gaugeMax: 100, zones: z2, zone: zoneOf(z2, pct),
      how: `비트코인 시가총액 ÷ 달러코인 전체 발행액. 숫자가 낮을수록 살 돈이 넉넉해요.`,
      why: '살 돈이 넉넉하면 가격이 오를 힘이 있고, 부족하면 더 오르기 힘들어요.',
      series: toPoints(st, ssr), seriesFmt: (x) => x.toFixed(2),
      score: pct,
    })
  }

  // ── 11. 새로 풀리는 코인 ──
  {
    const T = dense(supply)
    const now = T.v[T.v.length - 1], ago = T.v[T.v.length - 366]
    const infl = (now / ago - 1) * 100
    const zones: Zone[] = [{ to: Infinity, label: infl < 1.5 ? '금보다 귀함' : '금보다 흔함', tone: 'info', say: `💎 1년에 ${infl.toFixed(2)}%만 새로 생겨요`, text: `지난 1년 동안 새로 만들어진 비트코인은 전체의 ${infl.toFixed(2)}%뿐이에요(금은 약 1.5%). 4년마다 절반으로 줄어서, 다음 반감기 뒤엔 약 ${(infl / 2).toFixed(2)}%가 돼요.` }]
    list.push({
      id: 'issuance', group: 'miner', emoji: '💎', title: '새로 생기는 코인은 얼마나?', tech: '연간 발행률',
      easy: '1년 동안 채굴로 새로 생긴 비트코인이 전체의 몇 %인지',
      analogy: '돈을 새로 찍어내는 속도예요. 천천히 찍을수록 희귀해져요.',
      ends: ['적음', '많음'],
      value: infl, display: infl.toFixed(2) + '%', gaugeMin: 0, gaugeMax: 3, zones, zone: zones[0],
      how: `지금 유통량 ${Math.round(now).toLocaleString()}개를 1년 전과 비교 (최대 2,100만 개까지만 생겨요)`,
      why: '새로 생기는 코인이 적을수록 시장에 풀리는 물량이 줄어 희소성이 커져요.',
    })
  }

  // ── 12. 이더리움 총량 증감 ──
  if (eth.burned24h != null && eth.circulation) {
    const issued = 2700
    const net = issued - eth.burned24h
    const annual = (net * 365 / eth.circulation) * 100
    const b = Math.round(eth.burned24h).toLocaleString()
    const zones: Zone[] = [
      { to: 0, label: '줄어드는 중', tone: 'cold', say: '👍 이더리움이 줄고 있어요', text: `하루에 태워 없애는 양(${b}개)이 새로 생기는 양보다 많아요. 전체 개수가 줄어 희소해지고 있어요.` },
      { to: 0.5, label: '조금 늘어남', tone: 'neutral', say: '😐 조금씩 늘어요', text: `새로 생기는 양이 태우는 양(${b}개)보다 조금 많아요. 사용이 늘면 다시 줄어들 수 있어요.` },
      { to: Infinity, label: '늘어나는 중', tone: 'warm', say: '⚠️ 이더리움이 늘고 있어요', text: `태우는 양(${b}개/일)이 적어 전체 개수가 늘고 있어요. 네트워크를 쓰는 사람이 적다는 뜻이에요.` },
    ]
    list.push({
      id: 'ethsupply', group: 'eth', emoji: '🔥', title: '이더리움 개수는 늘고 있나?', tech: 'ETH 순발행률',
      easy: '이더리움 전체 개수가 늘고 있는지(인플레이션), 줄고 있는지(디플레이션)',
      analogy: '이더리움은 사용료 일부를 불태워 없애요. 많이 쓸수록 많이 타서 전체 개수가 줄어요.',
      ends: ['줄어듦', '늘어남'],
      value: annual, display: pctS(annual, 2) + '/년', gaugeMin: -2, gaugeMax: 1.5, zones, zone: zoneOf(zones, annual),
      how: `(하루 새로 생기는 양 약 ${issued.toLocaleString()}개 − 하루 태운 양) × 365 ÷ 전체 개수`,
      why: '개수가 줄면 같은 수요에서도 하나의 가치가 커질 수 있어요.',
    })
  }

  // ── 13. 이더리움 붐빔 ──
  if (eth.utilization != null) {
    const v = eth.utilization
    const zones: Zone[] = [
      { to: 30, label: '한산함', tone: 'cool', say: '🟢 한산해요, 수수료 쌈', text: '이더리움 블록이 많이 비어 있어요. 수수료는 싸지만 쓰는 사람이 적어요.' },
      { to: 60, label: '보통', tone: 'neutral', say: '😐 적당히 쓰이고 있어요', text: '블록이 적당히 차 있어요. 목표치(50%) 근처예요.' },
      { to: 90, label: '붐빔', tone: 'warm', say: '🟠 꽤 붐벼요', text: '쓰는 사람이 많아서 수수료가 오르고, 태워지는 이더리움도 늘어나요.' },
      { to: Infinity, label: '꽉 참', tone: 'hot', say: '🔴 꽉 찼어요, 수수료 비쌈', text: '블록이 꽉 찼어요. 수수료가 크게 오르는 구간이에요.' },
    ]
    list.push({
      id: 'ethutil', group: 'eth', emoji: '🚦', title: '이더리움은 붐비나?', tech: '블록 사용률',
      easy: '이더리움 블록(거래를 담는 상자)이 얼마나 꽉 차 있는지',
      analogy: '12초마다 출발하는 버스의 좌석이 얼마나 찼는지 보는 거예요.',
      ends: ['한산', '꽉 참'],
      value: v, display: v.toFixed(0) + '%', gaugeMin: 0, gaugeMax: 100, zones, zone: zoneOf(zones, v),
      how: '최근 블록에서 실제로 쓴 공간 ÷ 최대 공간', why: '50%를 넘으면 수수료가 오르고, 수수료가 오르면 태워 없애는 이더리움도 늘어나요.',
    })
  }

  // ── 종합 온도 ──
  const parts = list.filter((i) => i.score != null).map((i) => ({ title: i.title, score: i.score! }))
  const score = parts.reduce((a, p) => a + p.score, 0) / Math.max(1, parts.length)
  const temps: { to: number; label: string; tone: Tone; say: string; text: string }[] = [
    { to: 20, label: '매우 차가움', tone: 'cold', say: '🥶 지금 많이 싼 편이에요', text: '여러 지표가 “싸다”고 말하고 있어요. 분위기는 무섭지만, 예전엔 이런 때가 길게 보면 좋은 매수 기회였던 경우가 많았어요.' },
    { to: 40, label: '차가움', tone: 'cool', say: '🙂 조금 싼 편이에요', text: '시장이 식어 있어요. 길게 보면 가격이 싼 편이에요.' },
    { to: 60, label: '보통', tone: 'neutral', say: '😐 비싸지도 싸지도 않아요', text: '중간 지대예요. 서두르기보다 흐름을 지켜볼 때예요.' },
    { to: 80, label: '뜨거움', tone: 'warm', say: '⚠️ 조금 비싼 편이에요', text: '지표들이 “비싸지고 있다”고 말해요. 가격이 크게 출렁일 수 있으니 조심하세요.' },
    { to: Infinity, label: '매우 뜨거움', tone: 'hot', say: '🔥 너무 비싸요, 조심!', text: '여러 지표가 예전 최고점 수준이에요. 욕심보다 위험 관리가 중요한 때예요.' },
  ]
  const t = temps.find((x) => score < x.to)!
  return { list, temperature: { score, label: t.label, tone: t.tone, say: t.say, text: t.text, parts }, updated: Date.now() }
}
