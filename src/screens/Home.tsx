import { useMemo, useState } from 'react'
import { fetchOverview, fetchPulse, useFetch, type ChainSummary } from '../lib/api'
import { CHAINS, type ChainId } from '../lib/chains'
import { compact, money, num, pct } from '../lib/format'
import { useIndicators } from './Insights'
import { TONE_COLOR } from '../lib/indicators'
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
        title="온체인 트래커"
        sub={<Updated at={ov.updatedAt} error={ov.error} />}
        right={<RefreshButton loading={ov.loading || pulse.loading} onClick={() => { ov.reload(); pulse.reload() }} />}
      />
      <div className="content">
        <div className="pulse">
          <button className="pulse-card" onClick={() => onOpen('bitcoin')}>
            <div className="pulse-label"><span className="dot" style={{ background: '#f7931a' }} />BTC 수수료</div>
            <div className="pulse-val">{pulse.data ? num(pulse.data.btcFee, 0) : '-'}<small> sat/vB</small></div>
            <div className="pulse-sub">멤풀 {btc ? compact(btc.mempoolTx, 1) : '-'}건 대기</div>
          </button>
          <button className="pulse-card" onClick={() => onOpen('ethereum')}>
            <div className="pulse-label"><span className="dot" style={{ background: '#8c8cff' }} />ETH 가스</div>
            <div className="pulse-val">{pulse.data ? num(pulse.data.ethGas, 2) : '-'}<small> gwei</small></div>
            <div className="pulse-sub">사용률 {pulse.data ? num(pulse.data.ethUtil, 0) : '-'}%</div>
          </button>
        </div>

        <InsightSummary onClick={onInsights} />

        <div className="summary">
          <div><span>BTC 도미넌스</span><b>{btc ? num(btc.dominance, 1) + '%' : '-'}</b></div>
          <div><span>ETH 도미넌스</span><b>{eth ? num(eth.dominance, 1) + '%' : '-'}</b></div>
          <div><span>24h 온체인 거래</span><b>{totalTx ? compact(totalTx, 1) + '건' : '-'}</b></div>
        </div>

        <Section
          title="네트워크"
          right={<Segmented value={sort} onChange={setSort} options={[{ v: 'cap', l: '시총' }, { v: 'tx', l: '거래 수' }, { v: 'chg', l: '변동' }]} />}
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
            거래 {compact(c.tx24h, 1)} · 수수료 {money(c.avgFeeUsd)}
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
        <span className="dim small">🌡️ 오늘의 온체인 요약</span>
        <span className="dim small">분석 보기 ›</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
        <b style={{ fontSize: 28, color: c, letterSpacing: -1 }}>{Math.round(t.score)}</b>
        <b style={{ color: c }}>{t.label}</b>
        <span className="dim small">시장 온도</span>
      </div>
      {top.map((i) => (
        <div key={i.id} className="ins-line">
          <span className="ins-dot" style={{ background: TONE_COLOR[i.zone.tone] }} />
          <span><b>{i.title}</b> {i.zone.label} — <span className="dim">{i.zone.text.split('.')[0]}.</span></span>
        </div>
      ))}
    </button>
  )
}
