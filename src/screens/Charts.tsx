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
