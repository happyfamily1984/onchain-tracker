import { useMemo, useState } from 'react'
import { fetchOverview, fetchPulse, useFetch, type ChainSummary } from '../lib/api'
import { CHAINS, type ChainId } from '../lib/chains'
import { compact, money, num, pct } from '../lib/format'
import { useIndicators } from './Insights'
import { TONE_COLOR } from '../lib/indicators'
import { Term } from '../components/Term'
import { useOutlook } from '../components/Outlook'
import { CoinIcon, Header, RefreshButton, Section, Segmented, Skeleton, Updated } from '../components/ui'

type Sort = 'cap' | 'tx' | 'chg'

export default function Home({ onOpen, onInsights }: { onOpen: (id: ChainId) => void; onInsights: () => void }) {
  const ov = useFetch_overview()
  const pulse = usePulse()
  const [sort, setSort] = useState<Sort>('cap')

  const list = useMemo(() => {
    const l = [...(ov.data ?? [])]
    if (sort === 'cap') l.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    if (sort === 'tx') l.sort((a, b) => (b.tx24h ?? 0) - (a.tx24h ?? 0))
    if (sort === 'chg') l.sort((a, b) => (b.change24h ?? -999) - (a.change24h ?? -999))
    return l
  }, [ov.data, sort])

  const btc = ov.data?.find((c) => c.id === 'bitcoin')
  const eth = ov.data?.find((c) => c.id === 'ethereum')
  const totalTx = (ov.data ?? []).reduce((a, c) => a + (c.tx24h ?? 0), 0)

  return (
    <div className="screen">
      <Header
        title="🐋 코인 고래 레이더"
        sub={<Updated at={ov.updatedAt} error={ov.error} />}
        right={<RefreshButton loading={ov.loading || pulse.loading} onClick={() => { ov.reload(); pulse.reload() }} />}
      />
      <div className="content">
        <InsightSummary onClick={onInsights} />

        <div className="dim small" style={{ margin: '16px 2px 8px' }}>💸 지금 송금하면 수수료는? (보통 속도 기준)</div>
        <div className="pulse" style={{ marginTop: 0 }}>
          <button className="pulse-card" onClick={() => onOpen('bitcoin')}>
            <div className="pulse-label"><span className="dot" style={{ background: '#f7931a' }} />비트코인 보내기</div>
            <div className="pulse-val">{pulse.data?.btcFee != null && btc?.price ? money((pulse.data.btcFee * 140 * btc.price) / 1e8) : '-'}</div>
            <div className="pulse-sub">처리 대기 {btc ? compact(btc.mempoolTx, 1) : '-'}건 · {pulse.data ? num(pulse.data.btcFee, 0) : '-'} <Term k="satvb">sat/vB</Term></div>
          </button>
          <button className="pulse-card" onClick={() => onOpen('ethereum')}>
            <div className="pulse-label"><span className="dot" style={{ background: '#8c8cff' }} />이더리움 보내기</div>
            <div className="pulse-val">{pulse.data?.ethGas != null && eth?.price ? money(pulse.data.ethGas * 21000 * 1e-9 * eth.price) : '-'}</div>
            <div className="pulse-sub">붐빔 {pulse.data ? num(pulse.data.ethUtil, 0) : '-'}% · {pulse.data ? num(pulse.data.ethGas, 2) : '-'} <Term k="gwei">gwei</Term></div>
          </button>
        </div>

        <div className="summary">
          <div><span><Term k="dominance">비트코인 비중</Term></span><b>{btc ? num(btc.dominance, 1) + '%' : '-'}</b></div>
          <div><span><Term k="dominance">이더리움 비중</Term></span><b>{eth ? num(eth.dominance, 1) + '%' : '-'}</b></div>
          <div><span>하루 거래 건수</span><b>{totalTx ? compact(totalTx, 1) + '건' : '-'}</b></div>
        </div>

        <Section
          title="코인별 현황"
          right={<Segmented value={sort} onChange={setSort} options={[{ v: 'cap', l: '몸값순' }, { v: 'tx', l: '거래 많은순' }, { v: 'chg', l: '오른순' }]} />}
        >
          {!ov.data && !ov.error && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={76} />)}
          {!ov.data && ov.error && <div className="empty">{ov.error}<br /><button className="btn" onClick={ov.reload}>다시 시도</button></div>}
          <div className="list">
            {list.map((c) => <ChainRow key={c.id} c={c} onClick={() => onOpen(c.id)} />)}
          </div>
        </Section>
        <p className="foot">데이터: Blockchair · mempool.space · Blockscout · PublicNode</p>
      </div>
    </div>
  )
}

function ChainRow({ c, onClick }: { c: ChainSummary; onClick: () => void }) {
  const info = CHAINS.find((x) => x.id === c.id)!
  return (
    <button className="row" onClick={onClick}>
      <CoinIcon symbol={info.symbol} color={info.color} />
      <div className="row-main">
        <div className="row-top">
          <span className="row-name">{info.name}</span>
          <span className="row-price">{money(c.price)}</span>
        </div>
        <div className="row-bottom">
          <span className="row-meta">
            하루 거래 {compact(c.tx24h, 1)}건 · 평균 수수료 {money(c.avgFeeUsd)}
          </span>
          <span className={'chg ' + ((c.change24h ?? 0) >= 0 ? 'up' : 'down')}>{pct(c.change24h)}</span>
        </div>
      </div>
    </button>
  )
}

// 훅 래퍼 (다른 화면과 같은 캐시 키를 공유)
export const useFetch_overview = () => useFetch('overview', fetchOverview)
const usePulse = () => useFetch('pulse', fetchPulse)

/** 오늘의 온체인 요약: 시장 온도 + 눈에 띄는 신호 */
function InsightSummary({ onClick }: { onClick: () => void }) {
  const q = useIndicators()
  const d = q.data
  if (!d) return q.error ? null : <Skeleton h={110} />
  const t = d.temperature
  const c = TONE_COLOR[t.tone]
  // 극단 구간(가장 차갑거나 뜨거운) 신호 우선
  const rank = (tone: string) => (tone === 'hot' || tone === 'cold' ? 0 : tone === 'warm' || tone === 'cool' ? 1 : 2)
  const top = [...d.list].filter((i) => i.zone.tone !== 'info').sort((a, b) => rank(a.zone.tone) - rank(b.zone.tone)).slice(0, 3)
  return (
    <button className="card insight-home" onClick={onClick}>
      <div className="row-top">
        <span className="dim small">🌡️ 오늘의 한 줄 요약 · 비트코인 지금 비싼가요?</span>
        <span className="dim small">자세히 ›</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 28, color: c, letterSpacing: -1 }}>{Math.round(t.score)}점</b>
        <b style={{ color: c, fontSize: 16 }}>{t.say}</b>
      </div>
      <div className="dim small" style={{ marginTop: 2 }}>0점 = 아주 쌈 · 100점 = 아주 비쌈</div>
      <OutlookLine />
      {top.map((i) => (
        <div key={i.id} className="ins-line">
          <span className="ins-dot" style={{ background: TONE_COLOR[i.zone.tone] }} />
          <span><b>{i.title}</b> <span style={{ color: TONE_COLOR[i.zone.tone] }}>{i.zone.say}</span></span>
        </div>
      ))}
    </button>
  )
}

/** 홈 요약: 비트코인 상승 가능성 한 줄 */
function OutlookLine() {
  const q = useOutlook('bitcoin')
  if (!q.data) return null
  const c = (p: number) => (p >= 55 ? '#22c77a' : p > 45 ? '#a3adc2' : '#ff5c6c')
  return (
    <div className="ins-line" style={{ marginTop: 10 }}>
      <span>📈 <b>비트코인 오를 가능성</b>{' '}
        {q.data.horizons.map((h, i) => <span key={h.id}>{i > 0 && ' · '}{h.label}({h.period}) <b style={{ color: c(h.prob) }}>{h.prob}%</b></span>)}
      </span>
    </div>
  )
}
