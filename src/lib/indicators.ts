/**
 * 온체인 분석 지표 — "숫자가 무슨 뜻인지"를 함께 계산한다.
 * 데이터: blockchain.com 차트(5년 일별), DefiLlama 스테이블코인, Blockchair·Blockscout
 */
import type { Point } from './api'

export type Tone = 'cold' | 'cool' | 'neutral' | 'warm' | 'hot' | 'info'
export interface Zone { to: number; label: string; tone: Tone; text: string }

export interface Indicator {
  id: string
  group: 'value' | 'miner' | 'network' | 'flow' | 'eth'
  emoji: string
  title: string
  /** 한 줄 쉬운 설명 */
  easy: string
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
  temperature: { score: number; label: string; tone: Tone; text: string; parts: { title: string; score: number }[] }
  updated: number
}

export async function fetchIndicators(eth: { burned24h: number | null; circulation: number | null; utilization: number | null }): Promise<IndicatorResult> {
  const [price, rev, hash, fees, vol, addr, mcap, supply, stab] = await Promise.all([
    bci('market-price'), bci('miners-revenue'), bci('hash-rate'), bci('transaction-fees-usd'),
    bci('estimated-transaction-volume-usd'), bci('n-unique-addresses'), bci('market-cap'), bci('total-bitcoins'),
    stables().catch(() => null),
  ])
  const list: Indicator[] = []

  // ── 1. 메이어 멀티플 ──
  {
    const P = dense(price), ma = sma(P.v, 200)
    const ratio = P.v.map((x, i) => x / ma[i])
    const v = ratio[ratio.length - 1]
    const zones: Zone[] = [
      { to: 0.8, label: '저평가', tone: 'cold', text: '가격이 200일 평균보다 20% 이상 낮습니다. 과거 이 구간은 장기 매수자에게 좋은 기회였던 경우가 많았습니다.' },
      { to: 1.0, label: '약세', tone: 'cool', text: '가격이 200일 평균 아래에 있습니다. 시장 분위기가 약세이며 바닥을 다지는 구간일 수 있습니다.' },
      { to: 1.5, label: '중립', tone: 'neutral', text: '가격이 200일 평균 근처의 건강한 범위에 있습니다. 과열도 침체도 아닙니다.' },
      { to: 2.4, label: '강세', tone: 'warm', text: '가격이 장기 평균보다 꽤 높습니다. 상승 추세지만 과열로 갈수록 변동성이 커집니다.' },
      { to: Infinity, label: '과열', tone: 'hot', text: '가격이 200일 평균의 2.4배를 넘었습니다. 과거 대부분의 고점이 이 구간에서 나왔습니다.' },
    ]
    list.push({
      id: 'mayer', group: 'value', emoji: '📏', title: '메이어 멀티플',
      easy: '지금 가격이 최근 200일 평균 가격보다 얼마나 비싼지',
      value: v, display: f2(v) + '배', gaugeMin: 0.4, gaugeMax: 3, zones, zone: zoneOf(zones, v),
      how: '현재 가격 ÷ 200일 이동평균 가격', why: '200일 평균은 장기 추세선입니다. 가격이 이 선에서 너무 멀어지면 되돌아오는 경향이 있습니다.',
      history: '2.4배 이상은 2013·2017·2021년 고점 부근, 0.8배 이하는 2015·2018·2022년 바닥 부근에서 나타났습니다.',
      series: toPoints(P.start, ratio), seriesFmt: (x) => f2(x) + '배', refs: [0.8, 1, 2.4],
      score: lin(v, 0.6, 2.4),
    })
  }

  // ── 2. 200주 이동평균 ──
  {
    const P = dense(price), ma = sma(P.v, 1400)
    const ratio = P.v.map((x, i) => x / ma[i])
    const v = ratio[ratio.length - 1]
    if (isFinite(v)) {
      const zones: Zone[] = [
        { to: 1.0, label: '역사적 바닥권', tone: 'cold', text: '가격이 200주(약 4년) 평균 아래입니다. 비트코인 역사상 손에 꼽는 바닥 구간입니다.' },
        { to: 1.5, label: '저평가', tone: 'cool', text: '가격이 4년 평균선과 가깝습니다. 장기적으로 보면 아직 싼 편입니다.' },
        { to: 2.5, label: '중립', tone: 'neutral', text: '4년 평균 대비 적당한 수준입니다.' },
        { to: 4, label: '과열 주의', tone: 'warm', text: '4년 평균보다 크게 높습니다. 상승장 후반부에 자주 보이는 수준입니다.' },
        { to: Infinity, label: '과열', tone: 'hot', text: '4년 평균의 4배 이상으로, 과거 사이클 고점 수준입니다.' },
      ]
      list.push({
        id: 'wma200', group: 'value', emoji: '🧱', title: '200주 이동평균 배수',
        easy: '지금 가격이 4년(한 사이클) 평균 가격의 몇 배인지',
        value: v, display: f2(v) + '배', gaugeMin: 0.6, gaugeMax: 5, zones, zone: zoneOf(zones, v),
        how: `현재 가격 ÷ 최근 1,400일(200주) 평균 가격 (평균가 $${Math.round(ma[ma.length - 1]).toLocaleString()})`,
        why: '비트코인은 약 4년 주기로 움직입니다. 200주 평균선은 역대 약세장에서 거의 깨지지 않은 “최후의 지지선”으로 불립니다.',
        history: '2015·2018·2022년 바닥에서 가격이 이 선 근처까지 내려왔습니다.',
        series: toPoints(P.start, ratio), seriesFmt: (x) => f2(x) + '배', refs: [1, 2.5],
        score: lin(v, 0.8, 4),
      })
    }
  }

  // ── 3. NVT 시그널 ──
  {
    const M = dense(mcap), V = dense(vol)
    const vma = sma(V.v, 90)
    const nvt: number[] = []
    const startD = Math.max(M.start, V.start)
    for (let d = startD; d < M.start + M.v.length && d < V.start + V.v.length; d++) {
      nvt.push(M.v[d - M.start] / vma[d - V.start])
    }
    const v = nvt[nvt.length - 1]
    const pct = percentile(nvt, v)
    const zones: Zone[] = [
      { to: 20, label: '저평가', tone: 'cold', text: '네트워크에서 실제로 오가는 돈에 비해 시가총액이 낮습니다. 사용량 대비 싼 상태입니다.' },
      { to: 40, label: '다소 저평가', tone: 'cool', text: '실사용 대비 가격이 무난하거나 약간 싼 편입니다.' },
      { to: 60, label: '중립', tone: 'neutral', text: '시가총액과 실제 사용량이 균형을 이루고 있습니다.' },
      { to: 80, label: '고평가', tone: 'warm', text: '실제 사용량보다 가격이 앞서가고 있습니다. 기대감이 반영된 상태입니다.' },
      { to: Infinity, label: '과열', tone: 'hot', text: '사용량에 비해 시가총액이 지난 5년 중 가장 비싼 수준입니다. 거품 가능성에 주의하세요.' },
    ]
    list.push({
      id: 'nvt', group: 'value', emoji: '⚖️', title: 'NVT 시그널',
      easy: '비트코인의 “주가수익비율(PER)” — 실제 사용량 대비 몸값',
      value: v, display: v.toFixed(0), gauge: pct, gaugeMin: 0, gaugeMax: 100, zones, zone: zoneOf(zones, pct),
      how: `시가총액 ÷ 90일 평균 온체인 전송액(USD). 지난 5년 중 상위 ${Math.round(100 - pct)}% 수준`,
      why: '주식의 PER처럼, 네트워크가 실제로 처리하는 돈에 비해 가격이 비싼지 싼지 보여줍니다.',
      series: toPoints(startD, nvt), seriesFmt: (x) => x.toFixed(0),
      score: pct,
    })
  }

  // ── 4. 퍼엘 멀티플 ──
  {
    const R = dense(rev), r7 = sma(R.v, 7), r365 = sma(R.v, 365)
    const puell = R.v.map((_, i) => r7[i] / r365[i])
    const v = puell[puell.length - 1]
    const zones: Zone[] = [
      { to: 0.5, label: '채굴자 바닥', tone: 'cold', text: '채굴 수익이 1년 평균의 절반 이하입니다. 채굴자들이 매우 힘든 시기로, 역사적으로 강한 매수 구간이었습니다.' },
      { to: 0.8, label: '낮음', tone: 'cool', text: '채굴 수익이 평소보다 낮습니다. 채굴자 매도 압력이 줄어드는 구간입니다.' },
      { to: 1.5, label: '보통', tone: 'neutral', text: '채굴 수익이 1년 평균 수준입니다.' },
      { to: 3, label: '높음', tone: 'warm', text: '채굴 수익이 평소보다 많습니다. 채굴자들이 이익을 실현(매도)하기 좋은 환경입니다.' },
      { to: Infinity, label: '과열', tone: 'hot', text: '채굴 수익이 1년 평균의 3배 이상입니다. 과거 사이클 고점에서 나타난 수준입니다.' },
    ]
    list.push({
      id: 'puell', group: 'miner', emoji: '⛏️', title: '퍼엘 멀티플',
      easy: '채굴자들이 지금 평소보다 돈을 얼마나 많이(적게) 벌고 있는지',
      value: v, display: f2(v) + '배', gaugeMin: 0.2, gaugeMax: 4, zones, zone: zoneOf(zones, v),
      how: '최근 7일 평균 일일 채굴 수익(USD) ÷ 365일 평균', why: '채굴자는 시장에서 가장 꾸준한 매도자입니다. 이들의 수익 상태는 매도 압력과 사이클 위치를 알려줍니다.',
      history: '0.5 이하는 2015·2018·2022년 바닥, 4 이상은 2013·2017·2021년 고점 부근이었습니다.',
      series: toPoints(R.start, puell), seriesFmt: (x) => f2(x), refs: [0.5, 1, 3],
      score: lin(v, 0.4, 3),
    })
  }

  // ── 5. 해시 리본 ──
  {
    const H = dense(hash), m30 = sma(H.v, 30), m60 = sma(H.v, 60)
    const ratio = H.v.map((_, i) => (m30[i] / m60[i] - 1) * 100)
    const v = ratio[ratio.length - 1]
    let crossedUp = -1
    for (let i = ratio.length - 1; i > ratio.length - 30; i--) if (ratio[i] >= 0 && ratio[i - 1] < 0) { crossedUp = ratio.length - 1 - i; break }
    const zones: Zone[] = [
      { to: 0, label: '채굴자 항복 중', tone: 'cool', text: '해시레이트 단기 평균이 장기 평균 아래로 내려왔습니다. 수익이 안 나는 채굴자들이 장비를 끄고 코인을 파는 중입니다. 고통스럽지만 바닥 근처에서 자주 나타납니다.' },
      { to: Infinity, label: crossedUp >= 0 ? '회복 · 매수 신호' : '정상', tone: crossedUp >= 0 ? 'cold' : 'neutral',
        text: crossedUp >= 0 ? `${crossedUp}일 전 항복이 끝나고 해시레이트가 회복되기 시작했습니다. 해시 리본에서 가장 유명한 “매수 신호”입니다.` : '해시레이트가 꾸준히 늘고 있습니다. 채굴자들이 건강하게 운영 중입니다.' },
    ]
    list.push({
      id: 'hashribbon', group: 'miner', emoji: '🎗️', title: '해시 리본',
      easy: '채굴자들이 버티고 있는지, 포기(항복)하고 있는지',
      value: v, display: pctS(v, 2), gaugeMin: -8, gaugeMax: 8, zones, zone: zoneOf(zones, v),
      how: '해시레이트 30일 평균 ÷ 60일 평균 − 1', why: '채굴자 항복은 대량 매도를 동반하지만, 항복이 끝나는 시점은 역사적으로 좋은 매수 시점이었습니다.',
      history: '2018년 12월, 2020년 3월, 2022년 말 항복 이후 회복 신호가 나타났습니다.',
      series: toPoints(H.start, ratio), seriesFmt: (x) => pctS(x, 2), refs: [0],
    })
  }

  // ── 6. 활성 주소 추세 ──
  {
    const A = dense(addr), a30 = sma(A.v, 30), a365 = sma(A.v, 365)
    const mom = A.v.map((_, i) => (a30[i] / a365[i] - 1) * 100)
    const v = mom[mom.length - 1]
    const zones: Zone[] = [
      { to: -15, label: '수요 감소', tone: 'cool', text: '네트워크를 쓰는 사람이 1년 평균보다 크게 줄었습니다. 관심이 식은 상태입니다.' },
      { to: -5, label: '약화', tone: 'cool', text: '사용자 활동이 평소보다 조금 줄었습니다.' },
      { to: 5, label: '보합', tone: 'neutral', text: '사용자 활동이 1년 평균 수준입니다.' },
      { to: 15, label: '증가', tone: 'warm', text: '네트워크를 쓰는 사람이 늘고 있습니다. 수요가 살아나는 신호입니다.' },
      { to: Infinity, label: '급증', tone: 'hot', text: '사용자 활동이 크게 늘었습니다. 새로운 참여자가 몰려드는 강세장 특징입니다.' },
    ]
    list.push({
      id: 'active', group: 'network', emoji: '👥', title: '활성 주소 추세',
      easy: '비트코인을 실제로 쓰는 사람이 늘고 있는지',
      value: v, display: pctS(v), gaugeMin: -30, gaugeMax: 30, zones, zone: zoneOf(zones, v),
      how: `하루 활성 주소 30일 평균(${Math.round(a30[a30.length - 1]).toLocaleString()}개) ÷ 365일 평균 − 1`,
      why: '가격은 결국 사용자 수요를 따라갑니다. 가격은 오르는데 활성 주소가 줄면 상승의 힘이 약하다는 뜻일 수 있습니다.',
      series: toPoints(A.start, mom), seriesFmt: (x) => pctS(x), refs: [0],
    })
  }

  // ── 7. 온체인 전송액 추세 ──
  {
    const V = dense(vol), v30 = sma(V.v, 30), v365 = sma(V.v, 365)
    const mom = V.v.map((_, i) => (v30[i] / v365[i] - 1) * 100)
    const v = mom[mom.length - 1]
    const zones: Zone[] = [
      { to: -20, label: '거래 위축', tone: 'cool', text: '온체인에서 오가는 돈이 1년 평균보다 크게 줄었습니다.' },
      { to: -5, label: '약화', tone: 'cool', text: '온체인 전송액이 평소보다 조금 적습니다.' },
      { to: 5, label: '보합', tone: 'neutral', text: '온체인 전송액이 평소 수준입니다.' },
      { to: 25, label: '활발', tone: 'warm', text: '비트코인으로 오가는 돈이 늘고 있습니다. 경제 활동이 활발합니다.' },
      { to: Infinity, label: '매우 활발', tone: 'hot', text: '온체인 전송액이 크게 늘었습니다. 큰 손들의 움직임이 많아진 상태입니다.' },
    ]
    list.push({
      id: 'volume', group: 'network', emoji: '💸', title: '온체인 전송액 추세',
      easy: '비트코인 네트워크로 오가는 돈의 양이 늘고 있는지',
      value: v, display: pctS(v), gaugeMin: -40, gaugeMax: 40, zones, zone: zoneOf(zones, v),
      how: '하루 추정 전송액(USD) 30일 평균 ÷ 365일 평균 − 1', why: '네트워크의 실제 경제 활동량입니다. 가격과 함께 늘면 건강한 상승입니다.',
      series: toPoints(V.start, mom), seriesFmt: (x) => pctS(x), refs: [0],
    })
  }

  // ── 8. 수수료 비중 ──
  {
    const F = dense(fees), R = dense(rev)
    const f30 = sma(F.v, 30), r30 = sma(R.v, 30)
    const off = F.start - R.start
    const share = F.v.map((_, i) => (f30[i] / r30[i + off]) * 100)
    const v = share[share.length - 1]
    const zones: Zone[] = [
      { to: 2, label: '한산', tone: 'cool', text: '블록 공간 경쟁이 거의 없습니다. 송금하기 좋은 때지만, 네트워크 수요는 약한 편입니다.' },
      { to: 5, label: '보통', tone: 'neutral', text: '수수료가 채굴 수익의 적당한 부분을 차지합니다.' },
      { to: 15, label: '혼잡', tone: 'warm', text: '블록에 들어가려는 경쟁이 치열합니다. 사용 수요가 많습니다.' },
      { to: Infinity, label: '과열 수요', tone: 'hot', text: '수수료가 매우 비쌉니다. 투기적 수요(밈 토큰·인스크립션 등)나 공황 매매가 몰린 상태일 수 있습니다.' },
    ]
    list.push({
      id: 'feeshare', group: 'network', emoji: '🧾', title: '수수료 비중',
      easy: '채굴자 수익 중 거래 수수료가 차지하는 비율 = 블록 공간 수요',
      value: v, display: v.toFixed(1) + '%', gaugeMin: 0, gaugeMax: 20, zones, zone: zoneOf(zones, v),
      how: '30일 수수료 합계 ÷ 30일 채굴 수익 전체', why: '반감기마다 채굴 보상이 줄어들기 때문에, 장기적으로 네트워크 보안은 수수료가 책임져야 합니다. 수수료 비중은 진짜 수요의 척도입니다.',
      series: toPoints(F.start, share), seriesFmt: (x) => x.toFixed(1) + '%',
    })
  }

  // ── 9. 스테이블코인 공급 & SSR ──
  if (stab && stab.size > 400) {
    const S = dense(stab)
    const ch = S.v.map((x, i) => (i >= 30 ? (x / S.v[i - 30] - 1) * 100 : NaN))
    const v = ch[ch.length - 1]
    const zones: Zone[] = [
      { to: -2, label: '자금 이탈', tone: 'hot', text: '스테이블코인이 줄고 있습니다. 코인 시장에서 현금이 빠져나가는 중입니다.' },
      { to: 0, label: '정체', tone: 'cool', text: '대기 자금이 늘지 않고 있습니다.' },
      { to: 2, label: '완만한 유입', tone: 'neutral', text: '새로운 자금이 천천히 들어오고 있습니다.' },
      { to: 5, label: '유입', tone: 'warm', text: '코인을 살 수 있는 대기 자금이 빠르게 늘고 있습니다. 강세 연료가 쌓이는 중입니다.' },
      { to: Infinity, label: '강한 유입', tone: 'hot', text: '스테이블코인 발행이 급증하고 있습니다. 대규모 신규 자금이 시장에 들어오는 중입니다.' },
    ]
    list.push({
      id: 'stable', group: 'flow', emoji: '💵', title: '스테이블코인 증가율',
      easy: '코인을 사기 위해 대기 중인 “현금”이 늘고 있는지',
      value: v, display: pctS(v, 2), gaugeMin: -6, gaugeMax: 8, zones, zone: zoneOf(zones, v),
      how: `전체 스테이블코인 시가총액 30일 변화율 (현재 $${(S.v[S.v.length - 1] / 1e9).toFixed(1)}B)`,
      why: '스테이블코인은 코인 시장의 현금입니다. 이것이 늘어난다는 건 언제든 코인을 살 수 있는 돈이 쌓이고 있다는 뜻입니다.',
      series: toPoints(S.start, ch), seriesFmt: (x) => pctS(x, 2), refs: [0],
    })

    const M = dense(mcap)
    const ssr: number[] = []
    const st = Math.max(M.start, S.start)
    for (let d = st; d < M.start + M.v.length && d < S.start + S.v.length; d++) ssr.push(M.v[d - M.start] / S.v[d - S.start])
    const sv = ssr[ssr.length - 1]
    const pct = percentile(ssr, sv)
    const z2: Zone[] = [
      { to: 20, label: '매수 여력 풍부', tone: 'cold', text: '비트코인 몸값에 비해 대기 현금(스테이블코인)이 매우 많습니다. 잠재적 매수세가 강합니다.' },
      { to: 40, label: '여력 많음', tone: 'cool', text: '대기 자금이 비트코인 규모 대비 넉넉한 편입니다.' },
      { to: 60, label: '중립', tone: 'neutral', text: '비트코인과 대기 자금 비율이 평균적입니다.' },
      { to: 80, label: '여력 적음', tone: 'warm', text: '비트코인 규모에 비해 대기 현금이 적습니다. 추가 매수 연료가 부족할 수 있습니다.' },
      { to: Infinity, label: '여력 부족', tone: 'hot', text: '대기 현금이 비트코인 규모 대비 5년 중 가장 적은 수준입니다.' },
    ]
    list.push({
      id: 'ssr', group: 'flow', emoji: '🔋', title: '스테이블코인 공급 비율(SSR)',
      easy: '비트코인을 살 “총알(현금)”이 얼마나 넉넉한지',
      value: sv, display: sv.toFixed(2), gauge: pct, gaugeMin: 0, gaugeMax: 100, zones: z2, zone: zoneOf(z2, pct),
      how: `비트코인 시가총액 ÷ 스테이블코인 시가총액. 지난 기록 중 상위 ${Math.round(100 - pct)}% 수준`,
      why: '값이 낮을수록 스테이블코인의 구매력이 상대적으로 큽니다. 낮은 SSR은 강세 잠재력, 높은 SSR은 연료 부족을 뜻합니다.',
      series: toPoints(st, ssr), seriesFmt: (x) => x.toFixed(2),
      score: pct,
    })
  }

  // ── 10. 희소성: 연간 발행률 ──
  {
    const T = dense(supply)
    const now = T.v[T.v.length - 1], ago = T.v[T.v.length - 366]
    const infl = (now / ago - 1) * 100
    const zones: Zone[] = [{ to: Infinity, label: `금(약 1.5%)보다 ${infl < 1.5 ? '희소' : '많음'}`, tone: 'info', text: `지난 1년간 새로 발행된 비트코인은 공급량의 ${infl.toFixed(2)}%입니다. 반감기마다 절반으로 줄어 다음 반감기 후엔 약 ${(infl / 2).toFixed(2)}%가 됩니다.` }]
    list.push({
      id: 'issuance', group: 'miner', emoji: '💎', title: '연간 발행률(인플레이션)',
      easy: '1년 동안 새로 만들어진 비트코인이 전체의 몇 %인지',
      value: infl, display: infl.toFixed(2) + '%', gaugeMin: 0, gaugeMax: 3, zones, zone: zones[0],
      how: `현재 유통량 ${Math.round(now).toLocaleString()} BTC ÷ 1년 전 유통량 − 1 (최대 2,100만 개)`,
      why: '발행률이 낮을수록 새로 시장에 풀리는 물량(채굴자 매도 압력)이 적어 희소성이 커집니다.',
    })
  }

  // ── 11. 이더리움 순발행 ──
  if (eth.burned24h != null && eth.circulation) {
    // 지분증명 발행량 추정: 연 약 0.8% 수준 → 일 약 2,700 ETH
    const issued = 2700
    const net = issued - eth.burned24h
    const annual = (net * 365 / eth.circulation) * 100
    const zones: Zone[] = [
      { to: 0, label: '디플레이션', tone: 'cold', text: `하루 소각량(${Math.round(eth.burned24h).toLocaleString()} ETH)이 발행량보다 많아 이더리움 총량이 줄고 있습니다. 공급이 줄어드는 “초건전 화폐” 상태입니다.` },
      { to: 0.5, label: '약한 인플레이션', tone: 'neutral', text: '발행량이 소각량보다 조금 많습니다. 네트워크 사용이 늘면 소각이 커져 디플레이션으로 바뀝니다.' },
      { to: Infinity, label: '인플레이션', tone: 'warm', text: `소각이 적어(${Math.round(eth.burned24h).toLocaleString()} ETH/일) 공급이 늘고 있습니다. 네트워크 수수료 수요가 약하다는 뜻입니다.` },
    ]
    list.push({
      id: 'ethsupply', group: 'eth', emoji: '🔥', title: 'ETH 순발행률',
      easy: '이더리움 총량이 늘고 있는지(인플레) 줄고 있는지(디플레)',
      value: annual, display: pctS(annual, 2) + '/년', gaugeMin: -2, gaugeMax: 1.5, zones, zone: zoneOf(zones, annual),
      how: `(하루 발행 추정 ${issued.toLocaleString()} ETH − 24시간 소각량) × 365 ÷ 유통량`,
      why: '이더리움은 거래 수수료 일부를 태워 없앱니다. 사용이 많을수록 더 많이 타서 공급이 줄어듭니다.',
    })
  }

  // ── 12. 이더리움 블록 사용률 ──
  if (eth.utilization != null) {
    const v = eth.utilization
    const zones: Zone[] = [
      { to: 30, label: '한산', tone: 'cool', text: '블록이 많이 비어 있습니다. 가스비가 저렴하지만 수요는 약한 상태입니다.' },
      { to: 60, label: '보통', tone: 'neutral', text: '블록이 적당히 차 있습니다. 목표 사용률(50%) 근처입니다.' },
      { to: 90, label: '활발', tone: 'warm', text: '블록 수요가 많아 기본 수수료가 오르고 소각도 늘어납니다.' },
      { to: Infinity, label: '혼잡', tone: 'hot', text: '블록이 꽉 찼습니다. 가스비가 급등하는 구간입니다.' },
    ]
    list.push({
      id: 'ethutil', group: 'eth', emoji: '🚦', title: 'ETH 블록 사용률',
      easy: '이더리움 블록이 얼마나 꽉 차 있는지 = 네트워크 수요',
      value: v, display: v.toFixed(0) + '%', gaugeMin: 0, gaugeMax: 100, zones, zone: zoneOf(zones, v),
      how: '최근 블록 가스 사용량 ÷ 가스 한도', why: '50%를 넘으면 수수료가 오르고, 수수료가 오르면 ETH 소각이 늘어 공급이 줄어듭니다.',
    })
  }

  // ── 종합 온도 ──
  const parts = list.filter((i) => i.score != null).map((i) => ({ title: i.title, score: i.score! }))
  const score = parts.reduce((a, p) => a + p.score, 0) / Math.max(1, parts.length)
  const temps: { to: number; label: string; tone: Tone; text: string }[] = [
    { to: 20, label: '매우 차가움', tone: 'cold', text: '여러 지표가 역사적 저평가 구간을 가리킵니다. 공포가 큰 시기지만 장기 투자자에게는 기회였던 경우가 많았습니다.' },
    { to: 40, label: '차가움', tone: 'cool', text: '시장이 식어 있습니다. 가격이 장기 가치 대비 싼 편입니다.' },
    { to: 60, label: '보통', tone: 'neutral', text: '과열도 침체도 아닌 중간 지대입니다. 추세를 지켜볼 시기입니다.' },
    { to: 80, label: '뜨거움', tone: 'warm', text: '지표들이 과열 쪽으로 기울고 있습니다. 변동성 확대에 대비하세요.' },
    { to: Infinity, label: '매우 뜨거움', tone: 'hot', text: '여러 지표가 과거 사이클 고점 수준입니다. 위험 관리가 중요한 시기입니다.' },
  ]
  const t = temps.find((x) => score < x.to)!
  return { list, temperature: { score, label: t.label, tone: t.tone, text: t.text, parts }, updated: Date.now() }
}
