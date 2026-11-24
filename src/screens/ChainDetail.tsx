import { useState } from 'react'
import {
  bcTime, explorerUrl, fetchBtcChart, fetchBtcLive, fetchEthChart, fetchEthLive, fetchSolana, isValidAddress,
  useFetch, type ChainSummary, type Point, type Range,
} from '../lib/api'
import { BTC_HALVING_INTERVAL, chainById, type ChainId } from '../lib/chains'
import { ago, bytes, compact, dateStr, duration, hashrate, money, num, pct, shortHash } from '../lib/format'
import LineChart from '../components/LineChart'
import { CoinIcon, Header, Progress, RefreshButton, Section, Segmented, Skeleton, Stat, Updated, openExternal } from '../components/ui'
import { useFetch_overview } from './Home'

export default function ChainDetail({ id, onBack, onAddress }: { id: ChainId; onBack: () => void; onAddress: (chain: 'bitcoin' | 'ethereum', addr: string) => void }) {
  const info = chainById(id)
  const ov = useFetch_overview()
  const c = ov.data?.find((x) => x.id === id)
  const up = (c?.change24h ?? 0) >= 0

  return (
    <div className="screen">
      <Header
        title={<span className="title-coin"><CoinIcon symbol={info.symbol} color={info.color} size={26} />{info.name}</span>}
        sub={<Updated at={ov.updatedAt} error={ov.error} />}
        onBack={onBack}
        right={<RefreshButton loading={ov.loading} onClick={ov.reload} />}
      />
      <div className="content">
        <div className="hero">
          <div className="hero-price">{money(c?.price)}</div>
          <div className={'chg big ' + (up ? 'up' : 'down')}>{pct(c?.change24h)} <small>24시간</small></div>
          <div className="hero-sub">시가총액 {money(c?.marketCap, { compact: true })}{c?.dominance != null && ` · 점유율 ${num(c.dominance, 2)}%`}</div>
        </div>

        {(id === 'bitcoin' || id === 'ethereum') && <AddressSearch chain={id} onGo={onAddress} />}

        {id === 'bitcoin' && <BitcoinSection c={c} />}
        {id === 'ethereum' && <EthereumSection c={c} />}
        {id === 'solana' && <SolanaSection />}

        {c && id !== 'solana' && <GenericStats c={c} />}
        {c?.largestTxUsd != null && c.largestTxHash && (
          <Section title="🐋 24시간 최대 거래">
            <button className="card whale" onClick={() => openExternal(explorerUrl(id, 'tx', c.largestTxHash!))}>
              <div className="whale-val">{money(c.largestTxUsd, { compact: true })}</div>
              <div className="mono dim">{shortHash(c.largestTxHash, 10)} ↗</div>
            </button>
          </Section>
        )}
      </div>
    </div>
  )
}

function AddressSearch({ chain, onGo }: { chain: 'bitcoin' | 'ethereum'; onGo: (chain: 'bitcoin' | 'ethereum', addr: string) => void }) {
  const [q, setQ] = useState('')
  const valid = isValidAddress(chain, q.trim())
  return (
    <form className="search" onSubmit={(e) => { e.preventDefault(); if (valid) onGo(chain, q.trim()) }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={chain === 'bitcoin' ? 'BTC 주소 조회 (bc1…, 1…, 3…)' : 'ETH 주소 조회 (0x…)'} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
      <button className="btn" disabled={!valid}>조회</button>
    </form>
  )
}

function GenericStats({ c }: { c: ChainSummary }) {
  const info = chainById(c.id)
  const blockAge = c.lastBlockTime ? bcTime(c.lastBlockTime) : NaN
  const blockWord = info.ledger ? '원장' : '블록'
  return (
    <Section title="온체인 지표 (24시간)">
      <div className="grid">
        <Stat label="거래 수" value={compact(c.tx24h, 2)} sub={c.tps != null ? `평균 ${num(c.tps, 2)} TPS` : undefined} />
        <Stat label="전송량" value={money(c.volume24hUsd, { compact: true })} />
        <Stat label="평균 수수료" value={money(c.avgFeeUsd)} sub={c.medianFeeUsd != null ? `중앙값 ${money(c.medianFeeUsd)}` : undefined} />
        <Stat label={`생성 ${blockWord}`} value={num(c.blocks24h, 0)} sub={c.blocks24h ? `${blockWord}당 ${num(86400 / c.blocks24h, 1)}초` : undefined} />
        <Stat label={`최신 ${blockWord}`} value={num(c.height, 0)} sub={isFinite(blockAge) ? ago(blockAge) : undefined} />
        {c.mempoolTx != null && <Stat label="대기 거래(멤풀)" value={num(c.mempoolTx, 0)} sub={c.mempoolBytes ? bytes(c.mempoolBytes) : undefined} />}
        {c.hashrate != null && <Stat label="해시레이트" value={hashrate(c.hashrate)} />}
        {c.difficulty != null && <Stat label="난이도" value={compact(c.difficulty, 2)} />}
        {c.holdingAddresses != null && <Stat label="잔고 보유 주소" value={compact(c.holdingAddresses, 2)} />}
        {c.nodes != null && <Stat label="노드" value={num(c.nodes, 0)} />}
        {c.chainSize != null && <Stat label="체인 크기" value={bytes(c.chainSize)} />}
      </div>
    </Section>
  )
}

const RANGES: { v: Range; l: string }[] = [{ v: '1m', l: '1개월' }, { v: '3m', l: '3개월' }, { v: '1y', l: '1년' }]

function ChartBlock<M extends string>({ metrics, color, load, keyPrefix }: {
  metrics: { v: M; l: string; fmt: (v: number) => string }[]
  color: string
  keyPrefix: string
  load: (m: M, r: Range) => Promise<Point[]>
}) {
  const [m, setM] = useState<M>(metrics[0].v)
  const [r, setR] = useState<Range>('3m')
  const q = useFetch(`${keyPrefix}:${m}:${r}`, () => load(m, r), { refresh: false, maxAgeMs: 10 * 60_000 })
  const meta = metrics.find((x) => x.v === m)!
  return (
    <Section title="추이 차트">
      <div className="chips">
        {metrics.map((x) => <button key={x.v} className={'chip' + (x.v === m ? ' on' : '')} onClick={() => setM(x.v)}>{x.l}</button>)}
      </div>
      <div className="card">
        {q.data ? <LineChart points={q.data} color={color} format={meta.fmt} /> : q.error ? <div className="chart-empty">{q.error}</div> : <Skeleton h={210} />}
        <Segmented value={r} onChange={setR} options={RANGES} />
      </div>
    </Section>
  )
}

// ─────────────── 비트코인 ───────────────
function BitcoinSection({ c }: { c?: ChainSummary }) {
  const q = useFetch('btc-live', fetchBtcLive)
  const d = q.data
  const price = c?.price ?? 0
  const feeUsd = (satvb: number) => money((satvb * 140 * price) / 1e8)
  const height = d?.blocks[0]?.height ?? c?.height ?? 0
  const nextHalving = Math.ceil((height + 1) / BTC_HALVING_INTERVAL) * BTC_HALVING_INTERVAL
  const halvingLeft = nextHalving - height
  const halvingProgress = ((BTC_HALVING_INTERVAL - halvingLeft) / BTC_HALVING_INTERVAL) * 100
  const avgBlock = d?.diff.timeAvg ? d.diff.timeAvg / 1000 : 600

  return (
    <>
      <Section title="전송 수수료" right={<span className="dim small">일반 거래(140vB) 기준</span>}>
        <div className="fees">
          {([['빠름', d?.fees.fastestFee, '~10분'], ['보통', d?.fees.halfHourFee, '~30분'], ['느림', d?.fees.hourFee, '~1시간'], ['절약', d?.fees.economyFee, '수시간+']] as const).map(([l, v, t]) => (
            <div className="fee" key={l}>
              <div className="fee-l">{l}</div>
              <div className="fee-v">{v ?? '-'}</div>
              <div className="fee-u">sat/vB</div>
              <div className="fee-usd">{v != null && price ? feeUsd(v) : '-'}</div>
              <div className="fee-t">{t}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="멤풀 · 난이도 · 반감기">
        <div className="grid">
          <Stat label="대기 거래" value={d ? num(d.mempool.count, 0) + '건' : '-'} sub={d ? `${bytes(d.mempool.vsize)} vB · 블록 약 ${num(d.mempool.vsize / 1e6, 0)}개 분량` : undefined} />
          <Stat label="대기 수수료 합계" value={d ? num(d.mempool.total_fee / 1e8, 3) + ' BTC' : '-'} sub={d && price ? money((d.mempool.total_fee / 1e8) * price) : undefined} />
        </div>
        {d && (
          <div className="card">
            <div className="kv"><span>다음 난이도 조정</span><b className={d.diff.difficultyChange >= 0 ? 'up' : 'down'}>{pct(d.diff.difficultyChange)} 예상</b></div>
            <Progress value={d.diff.progressPercent} color="#f7931a" />
            <div className="kv dim small"><span>{num(d.diff.progressPercent, 1)}% · 남은 블록 {num(d.diff.remainingBlocks, 0)}</span><span>{dateStr(d.diff.estimatedRetargetDate, true)}</span></div>
            <div className="kv dim small"><span>평균 블록 간격</span><span>{num(avgBlock / 60, 2)}분</span></div>
          </div>
        )}
        <div className="card">
          <div className="kv"><span>다음 반감기 (#{num(nextHalving, 0)})</span><b>{num(halvingLeft, 0)}블록 남음</b></div>
          <Progress value={halvingProgress} color="#f7931a" />
          <div className="kv dim small"><span>{num(halvingProgress, 1)}%</span><span>약 {duration(halvingLeft * avgBlock)} 후 · {dateStr(Date.now() + halvingLeft * avgBlock * 1000)}</span></div>
        </div>
      </Section>

      <ChartBlock
        keyPrefix="btc-chart"
        color="#f7931a"
        load={fetchBtcChart}
        metrics={[
          { v: 'hash-rate', l: '해시레이트', fmt: hashrate },
          { v: 'n-transactions', l: '일일 거래 수', fmt: (v) => num(v, 0) + '건' },
          { v: 'n-unique-addresses', l: '활성 주소', fmt: (v) => num(v, 0) },
          { v: 'mempool-size', l: '멤풀 크기', fmt: bytes },
          { v: 'transaction-fees-usd', l: '수수료 총액', fmt: (v) => money(v, { compact: true }) },
          { v: 'miners-revenue', l: '채굴 수익', fmt: (v) => money(v, { compact: true }) },
          { v: 'difficulty', l: '난이도', fmt: (v) => compact(v, 2) },
        ]}
      />

      <Section title="최근 블록" right={<RefreshButton loading={q.loading} onClick={q.reload} />}>
        <div className="list">
          {!d && <Skeleton h={180} />}
          {d?.blocks.map((b) => (
            <button key={b.height} className="block" onClick={() => openExternal(`https://mempool.space/block/${b.height}`)}>
              <div className="block-h">#{num(b.height, 0)}</div>
              <div className="block-main">
                <div><b>{b.pool}</b> · {num(b.tx_count, 0)}건 · {bytes(b.size)}</div>
                <div className="dim small">수수료 {num(b.totalFees / 1e8, 3)} BTC · 중앙값 {num(b.medianFee, 1)} sat/vB</div>
              </div>
              <div className="dim small">{ago(b.timestamp)}</div>
            </button>
          ))}
        </div>
      </Section>
    </>
  )
}

// ─────────────── 이더리움 ───────────────
function EthereumSection({ c }: { c?: ChainSummary }) {
  const q = useFetch('eth-live', fetchEthLive)
  const d = q.data
  const price = c?.price ?? 0
  const raw = (c?.raw ?? {}) as Record<string, any>
  const burned24 = raw.burned_24h ? Number(raw.burned_24h) / 1e18 : null
  const burnedAll = raw.burned ? Number(raw.burned) / 1e18 : null
  const erc20 = raw.layer_2?.erc_20?.transactions_24h ?? null
  const nft = raw.layer_2?.erc_721?.transactions_24h ?? null
  const gasUsd = (gwei: number) => money(gwei * 21000 * 1e-9 * price)

  return (
    <>
      <Section title="가스비" right={<span className="dim small">단순 전송(21,000 gas) 기준</span>}>
        <div className="fees three">
          {([['빠름', d?.gas.fast], ['보통', d?.gas.average], ['느림', d?.gas.slow]] as const).map(([l, v]) => (
            <div className="fee" key={l}>
              <div className="fee-l">{l}</div>
              <div className="fee-v">{v != null ? num(v, 2) : '-'}</div>
              <div className="fee-u">gwei</div>
              <div className="fee-usd">{v != null && price ? gasUsd(v) : '-'}</div>
            </div>
          ))}
        </div>
        {d && (
          <div className="card">
            <div className="kv"><span>네트워크 사용률</span><b>{num(d.utilization, 1)}%</b></div>
            <Progress value={d.utilization} color="#8c8cff" />
            <div className="kv dim small"><span>평균 블록 시간</span><span>{num(d.blockTime, 1)}초</span></div>
          </div>
        )}
      </Section>

      <Section title="🔥 소각 · 토큰 활동">
        <div className="grid">
          <Stat label="24시간 소각" value={burned24 != null ? num(burned24, 2) + ' ETH' : '-'} sub={burned24 != null && price ? money(burned24 * price, { compact: true }) : undefined} accent="#ff8a4c" />
          <Stat label="누적 소각" value={burnedAll != null ? compact(burnedAll, 2) + ' ETH' : '-'} sub={burnedAll != null && price ? money(burnedAll * price, { compact: true }) : undefined} />
          <Stat label="ERC-20 전송 (24h)" value={compact(erc20, 2)} />
          <Stat label="NFT 전송 (24h)" value={compact(nft, 2)} />
          <Stat label="전체 주소" value={d ? compact(d.totalAddresses, 2) : '-'} />
          <Stat label="누적 거래" value={d ? compact(d.totalTx, 2) : '-'} />
        </div>
      </Section>

      <ChartBlock
        keyPrefix="eth-chart"
        color="#8c8cff"
        load={fetchEthChart}
        metrics={[
          { v: 'transactions', l: '일일 거래 수', fmt: (v) => num(v, 0) + '건' },
          { v: 'price', l: '가격', fmt: (v) => money(v) },
          { v: 'marketcap', l: '시가총액', fmt: (v) => money(v, { compact: true }) },
        ]}
      />

      <Section title="최근 블록" right={<RefreshButton loading={q.loading} onClick={q.reload} />}>
        <div className="list">
          {!d && <Skeleton h={160} />}
          {d?.blocks.map((b) => (
            <button key={b.height} className="block" onClick={() => openExternal(`https://eth.blockscout.com/block/${b.height}`)}>
              <div className="block-h">#{num(b.height, 0)}</div>
              <div className="block-main">
                <div><b>{b.builder?.startsWith('0x') ? shortHash(b.builder, 4) : b.builder}</b> · {num(b.tx, 0)}건</div>
                <div className="dim small">가스 {num((b.gasUsed / b.gasLimit) * 100, 0)}% · 기본료 {num(b.baseFee, 3)} gwei · 소각 {num(b.burnt, 4)} ETH</div>
              </div>
              <div className="dim small">{ago(b.timestamp)}</div>
            </button>
          ))}
        </div>
      </Section>
    </>
  )
}

// ─────────────── 솔라나 ───────────────
function SolanaSection() {
  const q = useFetch('sol-live', fetchSolana)
  const d = q.data?.sol
  const pts: Point[] = d?.tpsSamples.map((s) => ({ t: s.t, v: s.tps })) ?? []
  const nonVote = d ? d.tpsSamples.reduce((a, s) => a + s.nonVote, 0) / d.tpsSamples.length : null
  const tps = q.data?.tps ?? null
  const slotSec = 0.4
  const epochLeft = d ? (d.slotsInEpoch - d.slotIndex) * slotSec : 0
  const time = (t: number) => { const x = new Date(t); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` }
  return (
    <>
      <Section title="실시간 처리량">
        <div className="grid">
          <Stat label="TPS (최근 1시간)" value={num(tps, 0)} accent="#14f195" />
          <Stat label="사용자 TPS (투표 제외)" value={num(nonVote, 0)} />
          <Stat label="예상 일일 사용자 거래" value={compact(q.data?.tx24h, 2)} />
          <Stat label="누적 거래" value={d ? compact(d.totalTx, 2) : '-'} />
          <Stat label="블록 높이" value={num(q.data?.height, 0)} />
          <Stat label="슬롯" value={d ? num(d.absoluteSlot, 0) : '-'} />
        </div>
        <div className="card">
          {pts.length > 1 ? <LineChart points={pts} color="#14f195" format={(v) => num(v, 0) + ' TPS'} timeFormat={time} /> : q.error ? <div className="chart-empty">{q.error}</div> : <Skeleton h={210} />}
        </div>
      </Section>
      {d && (
        <Section title="에포크">
          <div className="card">
            <div className="kv"><span>에포크 {num(d.epoch, 0)}</span><b>{num((d.slotIndex / d.slotsInEpoch) * 100, 1)}%</b></div>
            <Progress value={(d.slotIndex / d.slotsInEpoch) * 100} color="#14f195" />
            <div className="kv dim small"><span>{num(d.slotIndex, 0)} / {num(d.slotsInEpoch, 0)} 슬롯</span><span>약 {duration(epochLeft)} 남음</span></div>
          </div>
        </Section>
      )}
    </>
  )
}
