import { useMemo, useState } from 'react'
import { useFetch } from '../lib/api'
import { fetchDominance, type DomItem, type DomResult } from '../lib/dominance'
import { money, num, pct } from '../lib/format'
import { useSettings } from '../lib/store'
import { analyze, fetchCandles, INTERVALS, MA_COLORS, MA_PERIODS, type ChartAsset, type Interval, type Signal, type TaItem } from '../lib/ta'
import CandleChart, { type Lower, type Overlays } from '../components/CandleChart'
import LineChart from '../components/LineChart'
import { Header, RefreshButton, Section, Segmented, Skeleton, Updated } from '../components/ui'

type View = ChartAsset | 'dominance'
const SIG: Record<Signal, { l: string; c: string }> = {
  buy: { l: '오르는 신호', c: '#22c77a' },
  sell: { l: '내리는 신호', c: '#ff5c6c' },
  neutral: { l: '중립', c: '#a3adc2' },
}
const memo: { view: View; iv: Interval; overlays: Overlays; lower: Lower } = {
  view: 'bitcoin', iv: '1d', overlays: { ma: true, bb: false, sr: true, fib: false }, lower: 'rsi',
}

export default function Charts() {
  const [view, setViewS] = useState<View>(memo.view)
  const setView = (v: View) => { memo.view = v; setViewS(v) }
  return (
    <div className="screen">
      <Header title="📉 차트 분석" sub="이평선·RSI·MACD 등 기술적 분석을 쉬운 말로" />
      <div className="content">
        <div className="seg wide" style={{ marginTop: 6 }}>
          <button className={view === 'bitcoin' ? 'on' : ''} onClick={() => setView('bitcoin')}>비트코인</button>
          <button className={view === 'ethereum' ? 'on' : ''} onClick={() => setView('ethereum')}>이더리움</button>
          <button className={view === 'dominance' ? 'on' : ''} onClick={() => setView('dominance')}>도미넌스</button>
        </div>
        {view === 'dominance' ? <Dominance /> : <CoinChart key={view} asset={view} />}
        <div className="disclaimer">
          ⚠️ 차트 분석은 과거 가격의 모양을 보고 판단하는 참고 자료예요. 같은 신호라도 틀리는 경우가 많아요. 이 앱의 정보는 투자 권유가 아니며, <b>투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있어요.</b>
        </div>
      </div>
    </div>
  )
}

function CoinChart({ asset }: { asset: ChartAsset }) {
  const [iv, setIvS] = useState<Interval>(memo.iv)
  const setIv = (v: Interval) => { memo.iv = v; setIvS(v) }
  const [overlays, setOv] = useState<Overlays>(memo.overlays)
  const toggle = (k: keyof Overlays) => { const o = { ...overlays, [k]: !overlays[k] }; memo.overlays = o; setOv(o) }
  const [lower, setLowerS] = useState<Lower>(memo.lower)
  const setLower = (l: Lower) => { memo.lower = l; setLowerS(l) }
  const { currency, krwRate } = useSettings()
  const fmt = useMemo(() => (v: number) => money(v), [currency, krwRate])

  const q = useFetch(`candles:${asset}:${iv}`, () => fetchCandles(asset, iv), { maxAgeMs: 60_000 })
  const c = q.data
  const meta = INTERVALS.find((x) => x.v === iv)!
  const ta = useMemo(() => (c && c.length > 130 ? analyze(c, meta.desc.replace('캔들 1개 = ', '') + ' 캔들', fmt) : null), [c, fmt, meta.desc])
  const lastC = c?.[c.length - 1], prevC = c?.[c.length - 2]
  const name = asset === 'bitcoin' ? '비트코인' : '이더리움'

  return (
    <>
      <div className="kv" style={{ marginTop: 12 }}>
        <div>
          <div className="hero-price" style={{ fontSize: 26 }}>{lastC ? money(lastC.close) : '-'}</div>
          {lastC && prevC && <div className={'chg ' + (lastC.close >= prevC.close ? 'up' : 'down')}>{pct((lastC.close / prevC.close - 1) * 100)} <small>직전 캔들 대비</small></div>}
        </div>
        <RefreshButton loading={q.loading} onClick={q.reload} />
      </div>
      <div className="dim small"><Updated at={q.updatedAt} error={q.error} /></div>

      <div className="chips" style={{ marginTop: 10 }}>
        {INTERVALS.map((x) => <button key={x.v} className={'chip' + (x.v === iv ? ' on' : '')} onClick={() => setIv(x.v)}>{x.l}</button>)}
      </div>
      <div className="dim small" style={{ marginTop: 6 }}>{meta.desc} · 두 손가락으로 확대, 옆으로 밀면 과거를 볼 수 있어요</div>

      <div className="card chart-card">
        <div className="chips">
          {([['ma', '이평선'], ['bb', '볼린저밴드'], ['sr', '지지·저항'], ['fib', '피보나치']] as const).map(([k, l]) => (
            <button key={k} className={'chip small-chip' + (overlays[k] ? ' on' : '')} onClick={() => toggle(k)}>{overlays[k] ? '✓ ' : ''}{l}</button>
          ))}
        </div>
        {!c && !q.error && <Skeleton h={420} />}
        {!c && q.error && <div className="empty small">{q.error}<br /><button className="btn" onClick={q.reload}>다시 시도</button></div>}
        {c && ta && <CandleChart candles={c} ta={ta} overlays={overlays} lower={lower} fmt={fmt} />}
        <div className="legend">
          {overlays.ma && MA_PERIODS.map((p) => <span key={p}><i style={{ background: MA_COLORS[p] }} />{p}선</span>)}
          {overlays.bb && <span><i style={{ background: 'rgba(200,210,235,.6)' }} />볼린저</span>}
          {overlays.sr && <><span><i style={{ background: '#22c77a' }} />지지</span><span><i style={{ background: '#ff5c6c' }} />저항</span></>}
          {overlays.fib && <span><i style={{ background: '#ffcf5a' }} />피보나치</span>}
        </div>
        <div className="kv" style={{ marginTop: 8 }}>
          <span className="dim small">아래 보조지표</span>
          <Segmented value={lower} onChange={setLower} options={[{ v: 'rsi', l: 'RSI' }, { v: 'macd', l: 'MACD' }, { v: 'stoch', l: '스토캐스틱' }]} />
        </div>
        {ta && <LowerGuide lower={lower} ta={ta} />}
      </div>

      {ta && (
        <>
          <Verdict ta={ta} name={name} ivLabel={meta.l} />
          <Section title="🔎 지표별 쉬운 해설" right={<span className="dim small">{meta.l} 기준</span>}>
            <div className="list">{ta.items.map((i) => <TaCard key={i.id} i={i} />)}</div>
          </Section>
        </>
      )}
    </>
  )
}

/** 차트 아래 보조지표(RSI·MACD·스토캐스틱) 해설 */
const GUIDE: Record<Lower, {
  name: string
  what: string
  lines: { color: string; label: string; shape?: 'bar' | 'dash' }[]
  read: string[]
  buy: string[]
  sell: string[]
  caution: string
}> = {
  rsi: {
    name: 'RSI (상대강도지수)',
    what: '최근 14개 캔들 동안 “오른 힘”과 “내린 힘” 중 어느 쪽이 더 셌는지를 0~100 점수로 보여줘요. 50이 딱 중간이에요.',
    lines: [
      { color: '#ffcf5a', label: '노란 선 = RSI 점수' },
      { color: '#ff5c6c', label: '빨간 점선 = 70 (과매수 선)', shape: 'dash' },
      { color: '#22c77a', label: '초록 점선 = 30 (과매도 선)', shape: 'dash' },
    ],
    read: [
      '70 위 → 짧은 기간에 너무 많이 올랐어요(과매수). 쉬어가거나 떨어지기 쉬워요.',
      '30 아래 → 짧은 기간에 너무 많이 떨어졌어요(과매도). 반등이 나오기 쉬워요.',
      '50 위 → 사려는 힘이 우세 / 50 아래 → 팔려는 힘이 우세',
    ],
    buy: ['30 아래로 내려갔다가 다시 30 위로 올라올 때', '가격은 더 낮아졌는데 RSI 저점은 높아질 때(상승 다이버전스)'],
    sell: ['70 위로 올라갔다가 다시 70 아래로 내려올 때', '가격은 더 높아졌는데 RSI 고점은 낮아질 때(하락 다이버전스)'],
    caution: '강한 상승장에서는 RSI가 70 위에 오래 머물 수 있어요. “70 넘었으니 무조건 떨어진다”는 아니에요.',
  },
  macd: {
    name: 'MACD (이동평균 수렴·확산)',
    what: '짧은 기간 평균(12)과 긴 기간 평균(26)의 차이로 “추세의 방향과 힘”을 보여줘요. 두 평균이 벌어질수록 추세가 강하다는 뜻이에요.',
    lines: [
      { color: '#4fb3ff', label: '파란 선 = MACD선 (빠른 선)' },
      { color: '#ff7a59', label: '주황 선 = 시그널선 (느린 선, MACD의 9개 평균)' },
      { color: '#22c77a', label: '막대(히스토그램) = 두 선의 차이 (초록 +, 빨강 −)', shape: 'bar' },
    ],
    read: [
      '파란 선이 주황 선 위 → 상승 쪽 힘이 우세해요.',
      '파란 선이 주황 선 아래 → 하락 쪽 힘이 우세해요.',
      '막대가 점점 커지면 그 방향의 힘이 세지는 중, 작아지면 힘이 빠지는 중이에요.',
      '두 선이 0선 위에 있으면 큰 흐름도 상승, 0선 아래면 큰 흐름도 하락이에요.',
    ],
    buy: ['파란 선이 주황 선을 아래에서 위로 뚫을 때(골든크로스)', '빨간 막대가 점점 작아질 때(하락 힘이 빠지는 중)'],
    sell: ['파란 선이 주황 선을 위에서 아래로 뚫을 때(데드크로스)', '초록 막대가 점점 작아질 때(상승 힘이 빠지는 중)'],
    caution: 'MACD는 평균을 쓰기 때문에 신호가 조금 늦게 나와요. 옆으로 횡보하는 장에서는 신호가 자주 틀려요.',
  },
  stoch: {
    name: '스토캐스틱',
    what: '최근 14개 캔들의 “가장 낮은 가격 = 0, 가장 높은 가격 = 100”으로 놓고, 지금 가격이 그 사이 어디쯤인지 보여줘요.',
    lines: [
      { color: '#4fb3ff', label: '파란 선 = %K (빠른 선, 지금 위치)' },
      { color: '#ff7a59', label: '주황 선 = %D (느린 선, %K의 평균)' },
      { color: '#ff5c6c', label: '빨간 점선 = 80 (천장권)', shape: 'dash' },
      { color: '#22c77a', label: '초록 점선 = 20 (바닥권)', shape: 'dash' },
    ],
    read: [
      '80 위 → 최근 범위의 천장 근처예요. 더 오르기 힘들 수 있어요.',
      '20 아래 → 최근 범위의 바닥 근처예요. 반등을 노려볼 자리예요.',
      'RSI보다 빠르게 움직여서 짧은 기간 매매 타이밍을 볼 때 많이 써요.',
    ],
    buy: ['20 아래 바닥권에서 파란 선이 주황 선을 위로 뚫을 때'],
    sell: ['80 위 천장권에서 파란 선이 주황 선을 아래로 뚫을 때'],
    caution: '아주 민감해서 신호가 자주 나와요. 이평선·MACD 같은 추세 지표와 함께 보는 게 좋아요.',
  },
}

function LowerGuide({ lower, ta }: { lower: Lower; ta: NonNullable<ReturnType<typeof analyze>> }) {
  const g = GUIDE[lower]
  const item = ta.items.find((i) => i.id === lower)
  const s = item ? SIG[item.signal] : SIG.neutral
  return (
    <div className="lower-guide">
      <div className="lg-title">📘 {g.name} 해설</div>
      {item && (
        <div className="lg-now" style={{ background: s.c + '18', borderColor: s.c + '55' }}>
          <div className="dim small">지금 상태 · {item.value}</div>
          <b style={{ color: s.c }}>{item.say}</b>
          <div className="small" style={{ marginTop: 4, lineHeight: 1.55 }}>{item.text}</div>
        </div>
      )}
      <p className="lg-what">{g.what}</p>
      <div className="lg-h">차트의 선은 이런 뜻이에요</div>
      <ul className="lg-lines">
        {g.lines.map((l) => (
          <li key={l.label}>
            <i className={l.shape ?? 'line'} style={{ background: l.shape === 'dash' ? 'none' : l.color, borderColor: l.color }} />{l.label}
          </li>
        ))}
      </ul>
      <div className="lg-h">이렇게 읽어요</div>
      <ul className="lg-read">{g.read.map((r) => <li key={r}>{r}</li>)}</ul>
      <div className="lg-sig">
        <div><div className="lg-h" style={{ color: '#22c77a' }}>▲ 사는 쪽 신호</div><ul>{g.buy.map((r) => <li key={r}>{r}</li>)}</ul></div>
        <div><div className="lg-h" style={{ color: '#ff5c6c' }}>▼ 파는 쪽 신호</div><ul>{g.sell.map((r) => <li key={r}>{r}</li>)}</ul></div>
      </div>
      <div className="lg-caution">⚠️ {g.caution}</div>
    </div>
  )
}

function Verdict({ ta, name, ivLabel }: { ta: NonNullable<ReturnType<typeof analyze>>; name: string; ivLabel: string }) {
  const c = SIG[ta.verdictTone].c
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="dim small">🧭 {name} {ivLabel} 차트 종합 의견</div>
      <div className="say" style={{ color: c, fontSize: 20 }}>{ta.verdict}</div>
      <div className="ta-bar">
        <div style={{ flex: ta.sell, background: SIG.sell.c }} />
        <div style={{ flex: ta.neutral, background: '#3a4459' }} />
        <div style={{ flex: ta.buy, background: SIG.buy.c }} />
      </div>
      <div className="kv small"><span style={{ color: SIG.sell.c }}>▼ 내리는 신호 {ta.sell}개</span><span className="dim">중립 {ta.neutral}개</span><span style={{ color: SIG.buy.c }}>▲ 오르는 신호 {ta.buy}개</span></div>
      <p className="explain" style={{ marginTop: 8, marginBottom: 0 }}>
        아래 {ta.items.length}가지 차트 지표를 각각 “오르는 신호 / 내리는 신호 / 중립”으로 판단해 합친 결과예요. 차트 기간(1시간·일봉 등)을 바꾸면 결과도 달라져요. 짧은 기간은 단타, 긴 기간은 큰 흐름을 볼 때 써요.
      </p>
    </div>
  )
}

function TaCard({ i }: { i: TaItem }) {
  const [open, setOpen] = useState(false)
  const s = SIG[i.signal]
  return (
    <div className="card ind" style={{ marginTop: 0 }}>
      <div className="ind-head">
        <div>
          <div className="ind-title">{i.emoji} {i.title}</div>
          <div className="ind-easy">{i.tech} · {i.value}</div>
        </div>
        <span className="tone-badge" style={{ color: s.c, background: s.c + '22' }}>{s.l}</span>
      </div>
      <div className="say" style={{ color: s.c }}>{i.say}</div>
      <div className="signal" style={{ marginTop: 8, background: s.c + '14' }}>💡 {i.text}</div>
      <button className="more" onClick={() => setOpen(!open)}>{open ? '접기 ▴' : '이 지표 보는 법 ▾'}</button>
      {open && <div className="analogy" style={{ marginTop: 8 }}>📘 {i.how}</div>}
    </div>
  )
}

// ───────── 도미넌스 ─────────
function Dominance() {
  const q = useFetch<DomResult>('dominance:v1', fetchDominance, { maxAgeMs: 10 * 60_000 })
  const d = q.data
  return (
    <>
      <p className="explain" style={{ marginTop: 12 }}>
        <b>도미넌스</b>는 전체 코인 시장(약 {d ? money(d.total, { compact: true }) : '-'}) 중에서 어떤 코인이 차지하는 비중이에요. 돈이 어디로 몰리는지 알 수 있어요.
      </p>
      <div className="dim small"><Updated at={q.updatedAt} error={q.error} /></div>
      {!d && !q.error && <><Skeleton h={120} /><Skeleton h={200} /></>}
      {!d && q.error && <div className="empty small">{q.error}<br /><button className="btn" onClick={q.reload}>다시 시도</button></div>}
      {d && (
        <>
          <div className="dom-bar">
            <div style={{ flex: d.now.btc, background: '#f7931a' }}><span>BTC {num(d.now.btc, 1)}%</span></div>
            <div style={{ flex: d.now.eth, background: '#8c8cff' }}><span>ETH</span></div>
            <div style={{ flex: Math.max(0, d.now.alt - d.now.eth), background: '#3cc8c8' }}><span>알트</span></div>
            <div style={{ flex: d.now.stable, background: '#26a17b' }}><span>달러코인</span></div>
          </div>
          <div className="dim small" style={{ marginTop: 4 }}>전체 코인 시장 구성</div>
          {d.historyNote && <div className="dim small" style={{ marginTop: 8 }}>ℹ️ {d.historyNote}</div>}
          <div className="list" style={{ marginTop: 12 }}>
            {d.items.map((i) => <DomCard key={i.id} i={i} d={d} />)}
          </div>
        </>
      )}
    </>
  )
}

function DomCard({ i, d }: { i: DomItem; d: DomResult }) {
  const [open, setOpen] = useState(i.id === 'usdt')
  const s = SIG[i.signal]
  const pts = d.history.slice(-365).map((p) => ({ t: p.t, v: p[i.key] }))
  return (
    <div className="card ind" style={{ marginTop: 0 }}>
      <div className="ind-head">
        <div>
          <div className="ind-title">{i.emoji} {i.title}</div>
          <div className="ind-easy"><b style={{ color: 'var(--text)', fontSize: 18 }}>{i.value}</b>{i.change && <span> · {i.change}</span>}</div>
        </div>
        <span className="tone-badge" style={{ color: s.c, background: s.c + '22' }}>{i.id === 'btc' ? '참고' : i.id === 'usdt' || i.id === 'stable' ? (i.signal === 'sell' ? '코인에 부담' : i.signal === 'buy' ? '코인에 좋음' : '중립') : s.l}</span>
      </div>
      <div className="say" style={{ color: s.c }}>{i.say}</div>
      <div className="signal" style={{ marginTop: 8, background: s.c + '14' }}>💡 {i.text}</div>
      <button className="more" onClick={() => setOpen(!open)}>{open ? '접기 ▴' : '1년 차트 · 보는 법 ▾'}</button>
      {open && (
        <div className="detail">
          {pts.length > 30 && <LineChart points={pts} color={i.key === 'usdt' ? '#26a17b' : i.key === 'btc' ? '#f7931a' : i.key === 'eth' ? '#8c8cff' : '#3cc8c8'} format={(v) => v.toFixed(2) + '%'} height={150} />}
          <div className="analogy">📘 {i.how}</div>
        </div>
      )}
    </div>
  )
}
