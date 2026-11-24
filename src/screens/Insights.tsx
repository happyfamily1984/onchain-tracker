import { useState } from 'react'
import { fetchPulse, useFetch } from '../lib/api'
import { fetchIndicators, TONE_COLOR, type Indicator, type IndicatorResult } from '../lib/indicators'
import { num } from '../lib/format'
import LineChart from '../components/LineChart'
import { Term } from '../components/Term'
import { Header, RefreshButton, Section, Skeleton, Updated } from '../components/ui'
import { useFetch_overview } from './Home'

const GROUPS: { id: Indicator['group']; title: string; sub: string }[] = [
  { id: 'value', title: '💰 지금 비싼가, 싼가?', sub: '평소 가격·쓰임새와 비교' },
  { id: 'flow', title: '🌊 코인을 살 돈이 들어오나?', sub: '시장의 대기 현금' },
  { id: 'miner', title: '⛏️ 채굴자들은 괜찮나?', sub: '꾸준히 코인을 파는 사람들' },
  { id: 'network', title: '📡 사람들이 많이 쓰고 있나?', sub: '실제 사용량' },
  { id: 'eth', title: '💠 이더리움은 어떤가?', sub: '개수와 붐빔 정도' },
]

export function useIndicators() {
  const ov = useFetch_overview()
  const eth = ov.data?.find((c) => c.id === 'ethereum')
  const raw = (eth?.raw ?? {}) as Record<string, any>
  const pulse = useFetch('pulse', fetchPulse)
  const ready = !!ov.data && (!!pulse.data || !!pulse.error)
  return useFetch<IndicatorResult>(
    ready ? 'indicators:v2' : null,
    () => fetchIndicators({
      burned24h: raw.burned_24h ? Number(raw.burned_24h) / 1e18 : null,
      circulation: raw.circulation_approximate ? Number(raw.circulation_approximate) / 1e18 : null,
      utilization: pulse.data?.ethUtil ?? null,
    }),
    { refresh: false, maxAgeMs: 60 * 60_000 },
  )
}

export default function Insights() {
  const q = useIndicators()
  const d = q.data
  return (
    <div className="screen">
      <Header title="쉬운 온체인 분석" sub={<Updated at={q.updatedAt} error={q.error} />} right={<RefreshButton loading={q.loading} onClick={q.reload} />} />
      <div className="content">
        <p className="explain" style={{ marginTop: 6 }}>
          블록체인에는 모든 거래가 공개돼 있어요(<Term k="onchain">온체인 데이터</Term>). 이 기록을 분석해서 <b>지금 비트코인이 싼지 비싼지, 돈이 들어오는지 나가는지</b>를 쉽게 알려드려요.
        </p>
        {!d && !q.error && <><Skeleton h={180} /><Skeleton h={160} /><Skeleton h={160} /></>}
        {!d && q.error && <div className="empty">{q.error}<br /><button className="btn" onClick={q.reload}>다시 시도</button></div>}
        {d && (
          <>
            <Thermometer t={d.temperature} />
            {GROUPS.map((g) => {
              const items = d.list.filter((i) => i.group === g.id)
              if (!items.length) return null
              return (
                <Section key={g.id} title={g.title} right={<span className="dim small">{g.sub}</span>}>
                  <div className="list">{items.map((i) => <IndicatorCard key={i.id} i={i} />)}</div>
                </Section>
              )
            })}
            <div className="disclaimer">
              ※ 이 지표들은 “과거에 이럴 때 이랬다”는 참고 자료예요. 미래 가격을 맞히는 도구가 아니에요. 한 가지 지표보다 여러 지표가 같은 쪽을 가리킬 때 더 믿을 만해요. 투자 판단과 책임은 본인에게 있어요.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function Thermometer({ t, compact }: { t: IndicatorResult['temperature']; compact?: boolean }) {
  const c = TONE_COLOR[t.tone]
  return (
    <div className="card thermo">
      <div className="dim small">🌡️ 비트코인, 지금 비싼가요? — <Term k="temp">시장 온도</Term></div>
      <div className="thermo-top" style={{ marginTop: 8 }}>
        <div className="thermo-num" style={{ color: c }}>{Math.round(t.score)}<span style={{ fontSize: 16, fontWeight: 600 }}>점</span></div>
        <div>
          <div className="thermo-label" style={{ color: c }}>{t.say}</div>
          <div className="dim small">0점에 가까울수록 싸고, 100점에 가까울수록 비싸요</div>
        </div>
      </div>
      <div className="thermo-bar"><span className="mark" style={{ left: `${t.score}%` }} /></div>
      <div className="thermo-scale"><span>🥶 쌈</span><span>보통</span><span>비쌈 🔥</span></div>
      <div className={'signal ' + (t.tone === 'cold' || t.tone === 'cool' ? 'bull' : t.tone === 'neutral' ? '' : 'bear')} style={{ marginTop: 12 }}>{t.text}</div>
      {!compact && (
        <>
          <div className="dim small" style={{ marginTop: 12 }}>이 점수는 아래 지표들의 평균이에요 (낮을수록 쌈)</div>
          <div className="parts">
            {t.parts.map((p) => <span key={p.title} className="part">{p.title} <b style={{ color: p.score < 40 ? TONE_COLOR.cool : p.score < 60 ? TONE_COLOR.neutral : TONE_COLOR.warm }}>{Math.round(p.score)}</b></span>)}
          </div>
        </>
      )}
    </div>
  )
}

function Gauge({ i }: { i: Indicator }) {
  const lo = i.gaugeMin, hi = i.gaugeMax
  const pos = (x: number) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100))
  let prev = lo
  const segs = i.zones.map((z) => { const a = pos(prev), b = pos(Math.min(z.to, hi)); prev = Math.min(z.to, hi); return { z, w: Math.max(0, b - a) } }).filter((s) => s.w > 0)
  const g = i.gauge ?? i.value
  return (
    <>
      <div className="gauge">
        {segs.map((s) => <span key={s.z.label} style={{ flex: s.w, background: TONE_COLOR[s.z.tone] }} />)}
        <span className="mark" style={{ left: `${pos(g)}%` }} />
      </div>
      {segs.length > 1 && (
        <div className="gauge-labels">{segs.map((s) => <span key={s.z.label} style={{ flex: s.w }}>{s.w >= 14 ? s.z.label : ''}</span>)}</div>
      )}
      <div className="gauge-ends"><span>◀ {i.ends[0]}</span><span>{i.ends[1]} ▶</span></div>
    </>
  )
}

function IndicatorCard({ i }: { i: Indicator }) {
  const [open, setOpen] = useState(false)
  const c = TONE_COLOR[i.zone.tone]
  return (
    <div className="card ind" style={{ marginTop: 0 }}>
      <div className="ind-head">
        <div>
          <div className="ind-title">{i.emoji} {i.title}</div>
          <div className="ind-easy">{i.easy}</div>
        </div>
        <span className="tone-badge" style={{ color: c, background: c + '22' }}>{i.zone.label}</span>
      </div>
      <div className="say" style={{ color: c }}>{i.zone.say}</div>
      <Gauge i={i} />
      <div className="signal" style={{ marginTop: 10, background: c + '14' }}>💡 {i.zone.text}</div>
      <button className="more" onClick={() => setOpen(!open)}>{open ? '접기 ▴' : '쉽게 이해하기 · 차트 ▾'}</button>
      {open && (
        <div className="detail">
          <div className="analogy">🧩 비유하면: {i.analogy}</div>
          <dl style={{ margin: 0 }}><dt>왜 중요한가요?</dt><dd>{i.why}</dd></dl>
          {i.history && <dl style={{ margin: 0 }}><dt>예전에는 어땠나요?</dt><dd>{i.history}</dd></dl>}
          {i.series && i.series.length > 2 && (
            <>
              <dl style={{ margin: 0 }}><dt>최근 1년 흐름 (주황 점선 = 기준선)</dt></dl>
              <LineChart points={i.series} color={c} format={i.seriesFmt ?? ((x) => num(x, 2))} refs={i.refs} height={160} />
            </>
          )}
          <dl style={{ margin: 0 }}>
            <dt>현재 수치 · 계산 방법</dt>
            <dd className="dim"><b style={{ color: c }}>{i.display}</b> — {i.how} <span className="ind-tech">전문 용어: {i.tech}</span></dd>
          </dl>
        </div>
      )}
    </div>
  )
}
