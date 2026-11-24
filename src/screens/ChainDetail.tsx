import { useState } from 'react'
import {
  bcTime, explorerUrl, fetchBtcChart, fetchBtcLive, fetchEthChart, fetchEthLive, fetchSolana, isValidAddress,
  useFetch, type ChainSummary, type Point, type Range,
} from '../lib/api'
import { BTC_HALVING_INTERVAL, chainById, type ChainId } from '../lib/chains'
import { ago, bytes, compact, dateStr, duration, hashrate, money, num, pct, shortHash } from '../lib/format'
import LineChart from '../components/LineChart'
import { Term } from '../components/Term'
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
          <div className="hero-sub">전체 몸값(<Term k="marketcap">시가총액</Term>) {money(c?.marketCap, { compact: true })}{c?.dominance != null && <> · 코인 시장 <Term k="dominance">비중</Term> {num(c.dominance, 2)}%</>}</div>
        </div>

        {(id === 'bitcoin' || id === 'ethereum') && <AddressSearch chain={id} onGo={onAddress} />}

        {id === 'bitcoin' && <BitcoinSection c={c} />}
        {id === 'ethereum' && <EthereumSection c={c} />}
        {id === 'solana' && <SolanaSection />}

        {c && id !== 'solana' && <GenericStats c={c} />}
        {c?.largestTxUsd != null && c.largestTxHash && (
          <Section title="🐋 오늘 가장 큰 거래">
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
    <Section title="📊 오늘 하루 (24시간) 활동">
      <div className="grid">
        <Stat label="거래 건수" value={compact(c.tx24h, 2) + '건'} sub={c.tps != null ? <>1초에 약 {num(c.tps, 1)}건 (<Term k="tps">TPS</Term>)</> : undefined} />
        <Stat label="옮겨진 금액" value={money(c.volume24hUsd, { compact: true })} />
        <Stat label="평균 수수료" value={money(c.avgFeeUsd)} sub={c.medianFeeUsd != null ? `보통 사람은 ${money(c.medianFeeUsd)} 정도` : undefined} />
        <Stat label={`생성 ${blockWord}`} value={num(c.blocks24h, 0)} sub={c.blocks24h ? `${blockWord}당 ${num(86400 / c.blocks24h, 1)}초` : undefined} />
        <Stat label={`최신 ${blockWord}`} value={num(c.height, 0)} sub={isFinite(blockAge) ? ago(blockAge) : undefined} />
        {c.mempoolTx != null && <Stat label={<>처리 대기 중 (<Term k="mempool">멤풀</Term>)</>} value={num(c.mempoolTx, 0) + '건'} sub={c.mempoolBytes ? bytes(c.mempoolBytes) : undefined} />}
        {c.hashrate != null && <Stat label={<Term k="hashrate">채굴 파워</Term>} value={hashrate(c.hashrate)} sub="높을수록 안전해요" />}
        {c.difficulty != null && <Stat label={<Term k="difficulty">채굴 난이도</Term>} value={compact(c.difficulty, 2)} />}
        {c.holdingAddresses != null && <Stat label="코인이 들어 있는 지갑 수" value={compact(c.holdingAddresses, 2)} />}
        {c.nodes != null && <Stat label={<Term k="node">노드(서버) 수</Term>} value={num(c.nodes, 0)} />}
        {c.chainSize != null && <Stat label="전체 기록 용량" value={bytes(c.chainSize)} />}
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
    <Section title="📈 그동안 어떻게 변했나?">
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
      <Section title="💸 지금 보내면 수수료는?" right={<span className="dim small">보통 송금 1건 기준</span>}>
        <div className="fees">
          {([['빠름', d?.fees.fastestFee, '약 10분'], ['보통', d?.fees.halfHourFee, '약 30분'], ['느림', d?.fees.hourFee, '약 1시간'], ['절약', d?.fees.economyFee, '몇 시간']] as const).map(([l, v, t]) => (
            <div className="fee" key={l}>
              <div className="fee-l">{l}</div>
              <div className="fee-v">{v != null && price ? feeUsd(v) : '-'}</div>
              <div className="fee-t">{t}</div>
              <div className="fee-u">{v ?? '-'} sat/vB</div>
            </div>
          ))}
        </div>
        <p className="dim small pad">빨리 처리되길 원할수록 수수료가 비싸요. 단위 <Term k="satvb">sat/vB</Term>는 몰라도 괜찮아요 — 위 금액만 보세요.</p>
      </Section>

      <Section title="🚦 네트워크 상황">
        <div className="grid">
          <Stat label={<>처리 대기 중 (<Term k="mempool">멤풀</Term>)</>} value={d ? num(d.mempool.count, 0) + '건' : '-'} sub={d ? `다 처리하려면 블록 약 ${num(d.mempool.vsize / 1e6, 0)}개 (약 ${num(d.mempool.vsize / 1e6 * 10, 0)}분) 필요` : undefined} />
          <Stat label="기다리는 거래들의 수수료 합계" value={d ? num(d.mempool.total_fee / 1e8, 3) + ' BTC' : '-'} sub={d && price ? money((d.mempool.total_fee / 1e8) * price) : undefined} />
        </div>
        {d && (
          <div className="card">
            <div className="kv"><span>다음 <Term k="difficulty">채굴 난이도</Term> 조정</span><b className={d.diff.difficultyChange >= 0 ? 'up' : 'down'}>{pct(d.diff.difficultyChange)} 예상</b></div>
            <div className="dim small">{d.diff.difficultyChange >= 0 ? '채굴자가 늘어서 채굴이 더 어려워질 예정이에요' : '채굴자가 줄어서 채굴이 쉬워질 예정이에요'}</div>
            <Progress value={d.diff.progressPercent} color="#f7931a" />
            <div className="kv dim small"><span>{num(d.diff.progressPercent, 1)}% · 남은 블록 {num(d.diff.remainingBlocks, 0)}</span><span>{dateStr(d.diff.estimatedRetargetDate, true)}</span></div>
            <div className="kv dim small"><span>요즘 블록 생성 간격 (목표 10분)</span><span>{num(avgBlock / 60, 2)}분</span></div>
          </div>
        )}
        <div className="card">
          <div className="kv"><span>다음 <Term k="halving">반감기</Term>까지</span><b>약 {duration(halvingLeft * avgBlock)}</b></div>
          <div className="dim small">채굴 보상이 절반으로 줄어드는 날이에요 (남은 블록 {num(halvingLeft, 0)}개)</div>
          <Progress value={halvingProgress} color="#f7931a" />
          <div className="kv dim small"><span>{num(halvingProgress, 1)}% 진행</span><span>예상 날짜 {dateStr(Date.now() + halvingLeft * avgBlock * 1000)}</span></div>
        </div>
      </Section>

      <ChartBlock
        keyPrefix="btc-chart"
        color="#f7931a"
        load={fetchBtcChart}
        metrics={[
          { v: 'hash-rate', l: '채굴 파워', fmt: hashrate },
          { v: 'n-transactions', l: '하루 거래 건수', fmt: (v) => num(v, 0) + '건' },
          { v: 'n-unique-addresses', l: '사용한 지갑 수', fmt: (v) => num(v, 0) + '개' },
          { v: 'mempool-size', l: '대기 거래량', fmt: bytes },
          { v: 'transaction-fees-usd', l: '하루 수수료 합계', fmt: (v) => money(v, { compact: true }) },
          { v: 'miners-revenue', l: '채굴자 하루 수입', fmt: (v) => money(v, { compact: true }) },
          { v: 'difficulty', l: '채굴 난이도', fmt: (v) => compact(v, 2) },
        ]}
      />

      <Section title="🧱 방금 만들어진 블록" right={<RefreshButton loading={q.loading} onClick={q.reload} />}>
        <div className="list">
          {!d && <Skeleton h={180} />}
          {d?.blocks.map((b) => (
            <button key={b.height} className="block" onClick={() => openExternal(`https://mempool.space/block/${b.height}`)}>
              <div className="block-h">#{num(b.height, 0)}</div>
              <div className="block-main">
                <div>⛏️ <b>{b.pool}</b> 채굴 · 거래 {num(b.tx_count, 0)}건</div>
                <div className="dim small">채굴자가 받은 수수료 {price ? money((b.totalFees / 1e8) * price) : num(b.totalFees / 1e8, 3) + ' BTC'}</div>
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
      <Section title="💸 지금 보내면 수수료는?" right={<span className="dim small">보통 송금 1건 기준</span>}>
        <div className="fees three">
          {([['빠름', d?.gas.fast], ['보통', d?.gas.average], ['느림', d?.gas.slow]] as const).map(([l, v]) => (
            <div className="fee" key={l}>
              <div className="fee-l">{l}</div>
              <div className="fee-v">{v != null && price ? gasUsd(v) : '-'}</div>
              <div className="fee-u">{v != null ? num(v, 2) : '-'} gwei</div>
            </div>
          ))}
        </div>
        {d && (
          <div className="card">
            <div className="kv"><span>블록이 얼마나 찼나 (붐빔 정도)</span><b>{num(d.utilization, 1)}%</b></div>
            <Progress value={d.utilization} color="#8c8cff" />
            <div className="kv dim small"><span>블록 생성 간격</span><span>{num(d.blockTime, 1)}초</span></div>
          </div>
        )}
      </Section>

      <Section title="🔥 태워 없앤 이더리움 · 토큰 활동">
        <div className="grid">
          <Stat label={<>오늘 <Term k="burn">태워 없앤</Term> 양</>} value={burned24 != null ? num(burned24, 2) + ' ETH' : '-'} sub={burned24 != null && price ? money(burned24 * price, { compact: true }) : undefined} accent="#ff8a4c" />
          <Stat label="지금까지 태운 양" value={burnedAll != null ? compact(burnedAll, 2) + ' ETH' : '-'} sub={burnedAll != null && price ? money(burnedAll * price, { compact: true }) : undefined} />
          <Stat label={<>오늘 <Term k="erc20">토큰</Term> 전송</>} value={compact(erc20, 2) + '건'} />
          <Stat label="오늘 NFT 전송" value={compact(nft, 2) + '건'} />
          <Stat label="전체 지갑 수" value={d ? compact(d.totalAddresses, 2) : '-'} />
          <Stat label="지금까지 거래 건수" value={d ? compact(d.totalTx, 2) : '-'} />
        </div>
      </Section>

      <ChartBlock
        keyPrefix="eth-chart"
        color="#8c8cff"
        load={fetchEthChart}
        metrics={[
          { v: 'transactions', l: '하루 거래 건수', fmt: (v) => num(v, 0) + '건' },
          { v: 'price', l: '가격', fmt: (v) => money(v) },
          { v: 'marketcap', l: '전체 몸값', fmt: (v) => money(v, { compact: true }) },
        ]}
      />

      <Section title="🧱 방금 만들어진 블록" right={<RefreshButton loading={q.loading} onClick={q.reload} />}>
        <div className="list">
          {!d && <Skeleton h={160} />}
          {d?.blocks.map((b) => (
            <button key={b.height} className="block" onClick={() => openExternal(`https://eth.blockscout.com/block/${b.height}`)}>
              <div className="block-h">#{num(b.height, 0)}</div>
              <div className="block-main">
                <div>🧱 <b>{b.builder?.startsWith('0x') ? shortHash(b.builder, 4) : b.builder}</b> · 거래 {num(b.tx, 0)}건</div>
                <div className="dim small">{num((b.gasUsed / b.gasLimit) * 100, 0)}% 찼음 · 태운 양 {price ? money(b.burnt * price) : num(b.burnt, 4) + ' ETH'}</div>
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
      <Section title="⚡ 얼마나 빨리 처리하나?">
        <div className="grid">
          <Stat label={<>1초에 처리하는 거래 (<Term k="tps">TPS</Term>)</>} value={num(tps, 0)} accent="#14f195" />
          <Stat label="그중 사람들의 거래" sub="시스템 투표 거래 제외" value={num(nonVote, 0)} />
          <Stat label="하루 예상 거래 건수" value={compact(q.data?.tx24h, 2)} />
          <Stat label="누적 거래" value={d ? compact(d.totalTx, 2) : '-'} />
          <Stat label="블록 번호" value={num(q.data?.height, 0)} />
          <Stat label="슬롯" value={d ? num(d.absoluteSlot, 0) : '-'} />
        </div>
        <div className="card">
          {pts.length > 1 ? <LineChart points={pts} color="#14f195" format={(v) => num(v, 0) + ' TPS'} timeFormat={time} /> : q.error ? <div className="chart-empty">{q.error}</div> : <Skeleton h={210} />}
        </div>
      </Section>
      {d && (
        <Section title={<Term k="epoch">에포크 (정산 주기)</Term>}>
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
