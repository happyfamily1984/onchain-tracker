import { useMemo, useState } from 'react'
import { fetchOverview, fetchPulse, useFetch, type ChainSummary } from '../lib/api'
import { CHAINS, type ChainId } from '../lib/chains'
import { compact, money, num, pct } from '../lib/format'
import { CoinIcon, Header, RefreshButton, Section, Segmented, Skeleton, Updated } from '../components/ui'

type Sort = 'cap' | 'tx' | 'chg'

export default function Home({ onOpen }: { onOpen: (id: ChainId) => void }) {
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
