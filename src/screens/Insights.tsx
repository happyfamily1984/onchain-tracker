import { useState } from 'react'
import { fetchPulse, useFetch } from '../lib/api'
import { fetchIndicators, TONE_COLOR, type Indicator, type IndicatorResult } from '../lib/indicators'
import { num } from '../lib/format'
import LineChart from '../components/LineChart'
import { Header, RefreshButton, Section, Skeleton, Updated } from '../components/ui'
import { useFetch_overview } from './Home'

const GROUPS: { id: Indicator['group']; title: string; sub: string }[] = [
  { id: 'value', title: '💰 지금 비싼가, 싼가?', sub: '가격을 장기 평균·실사용량과 비교' },
  { id: 'flow', title: '🌊 돈이 들어오고 있나?', sub: '코인 시장의 대기 자금' },
  { id: 'miner', title: '⛏️ 채굴자는 어떤 상태인가?', sub: '가장 꾸준한 매도자의 사정' },
  { id: 'network', title: '📡 네트워크를 많이 쓰고 있나?', sub: '실제 사용 수요' },
  { id: 'eth', title: '💠 이더리움 상태', sub: '공급과 사용 수요' },
]

export function useIndicators() {
  const ov = useFetch_overview()
  const eth = ov.data?.find((c) => c.id === 'ethereum')
  const raw = (eth?.raw ?? {}) as Record<string, any>
  const pulse = useFetch('pulse', fetchPulse)
  const ready = !!ov.data && (!!pulse.data || !!pulse.error)
  return useFetch<IndicatorResult>(
    ready ? 'indicators' : null,
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
      <Header title="온체인 분석" sub={<Updated at={q.updatedAt} error={q.error} />} right={<RefreshButton loading={q.loading} onClick={q.reload} />} />
      <div className="content">
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
              ※ 온체인 지표는 과거 패턴을 바탕으로 한 참고 자료이며, 미래 가격을 보장하지 않습니다. 하나의 지표보다 여러 지표가 같은 방향을 가리킬 때 의미가 커집니다. 투자 판단과 책임은 본인에게 있습니다.
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
      <div className="dim small">🌡️ 비트코인 시장 온도 (가치 지표 종합)</div>
      <div className="thermo-top" style={{ marginTop: 8 }}>
        <div className="thermo-num" style={{ color: c }}>{Math.round(t.score)}</div>
        <div>
          <div className="thermo-label" style={{ color: c }}>{t.label}</div>
          <div className="dim small">0 = 극저평가 · 100 = 극과열</div>
        </div>
      </div>
      <div className="thermo-bar"><span className="mark" style={{ left: `${t.score}%` }} /></div>
      <div className="thermo-scale"><span>🥶 매수 관심</span><span>중립</span><span>과열 주의 🔥</span></div>
      <div className={'signal ' + (t.tone === 'cold' || t.tone === 'cool' ? 'bull' : t.tone === 'neutral' ? '' : 'bear')} style={{ marginTop: 12 }}>{t.text}</div>
      {!compact && (
        <div className="parts">
          {t.parts.map((p) => <span key={p.title} className="part">{p.title} <b style={{ color: p.score < 40 ? TONE_COLOR.cool : p.score < 60 ? TONE_COLOR.neutral : TONE_COLOR.warm }}>{Math.round(p.score)}</b></span>)}
        </div>
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
        <div className="gauge-labels">{segs.map((s) => <span key={s.z.label} style={{ flex: s.w }}>{s.z.label}</span>)}</div>
      )}
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
      <div className="ind-val"><b style={{ color: c }}>{i.display}</b>{i.gauge != null && i.gaugeMax === 100 && <span className="dim small">지난 기록 중 하위 {num(i.gauge, 0)}%</span>}</div>
      <Gauge i={i} />
      <div className="signal" style={{ marginTop: 10, background: c + '14' }}>💡 {i.zone.text}</div>
      <button className="more" onClick={() => setOpen(!open)}>{open ? '접기 ▴' : '자세히 · 차트 ▾'}</button>
      {open && (
        <div className="detail">
          {i.series && i.series.length > 2 && <LineChart points={i.series} color={c} format={i.seriesFmt ?? ((x) => num(x, 2))} refs={i.refs} height={160} />}
          <dl style={{ margin: 0 }}>
            <dt>왜 중요한가요?</dt><dd>{i.why}</dd>
          </dl>
          {i.history && <dl style={{ margin: 0 }}><dt>과거에는?</dt><dd>{i.history}</dd></dl>}
          <dl style={{ margin: 0 }}><dt>계산 방법</dt><dd className="dim">{i.how}</dd></dl>
        </div>
      )}
    </div>
  )
}
