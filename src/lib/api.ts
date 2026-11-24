import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAINS, type ChainId } from './chains'
import { getSettings, updateSettings } from './store'

// ───────────── 공통 fetch ─────────────
const memCache = new Map<string, { t: number; v: unknown }>()

async function getJSON<T>(url: string, init?: RequestInit, timeout = 15000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

async function cached<T>(key: string, maxAgeMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memCache.get(key)
  if (hit && Date.now() - hit.t < maxAgeMs) return hit.v as T
  const v = await fn()
  memCache.set(key, { t: Date.now(), v })
  try { localStorage.setItem('cache:' + key, JSON.stringify({ t: Date.now(), v })) } catch { /* ignore */ }
  return v
}

function persisted<T>(key: string): { t: number; v: T } | null {
  const hit = memCache.get(key)
  if (hit) return hit as { t: number; v: T }
  try {
    const raw = localStorage.getItem('cache:' + key)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

/** 주기적 갱신 + 마지막 데이터 즉시 표시 */
export function useFetch<T>(key: string | null, fn: () => Promise<T>, opts: { refresh?: boolean; maxAgeMs?: number } = {}) {
  const { refresh = true, maxAgeMs = 20_000 } = opts
  const initial = key ? persisted<T>(key) : null
  const [data, setData] = useState<T | null>(initial?.v ?? null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(initial?.t ?? null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const load = useCallback(async (force = false) => {
    if (!key) return
    setLoading(true)
    try {
      const v = await cached(key, force ? 0 : maxAgeMs, () => fnRef.current())
      setData(v)
      setUpdatedAt(memCache.get(key)?.t ?? Date.now())
      setError(null)
    } catch (e) {
      setError(e instanceof Error && e.name === 'AbortError' ? '응답 시간 초과' : '데이터를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [key, maxAgeMs])

  useEffect(() => {
    const p = key ? persisted<T>(key) : null
    setData(p?.v ?? null)
    setUpdatedAt(p?.t ?? null)
    load()
    if (!refresh) return
    const sec = Math.max(15, getSettings().refreshSec)
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, sec * 1000)
    return () => clearInterval(id)
  }, [key, load, refresh])

  return { data, error, loading, updatedAt, reload: () => load(true) }
}

// ───────────── 환율 ─────────────
export async function refreshKrwRate() {
  try {
    const r = await getJSON<{ rates: Record<string, number> }>('https://open.er-api.com/v6/latest/USD')
    if (r.rates?.KRW) updateSettings({ krwRate: r.rates.KRW })
  } catch { /* 이전 값 유지 */ }
}

// ───────────── 전체 체인 요약 (Blockchair) ─────────────
export interface ChainSummary {
  id: ChainId
  price: number | null
  change24h: number | null
  marketCap: number | null
  dominance: number | null
  tx24h: number | null
  mempoolTx: number | null
  tps: number | null
  avgFeeUsd: number | null
  medianFeeUsd: number | null
  height: number | null
  lastBlockTime: string | null
  blocks24h: number | null
  hashrate: number | null
  difficulty: number | null
  volume24hUsd: number | null
  largestTxUsd: number | null
  largestTxHash: string | null
  nodes: number | null
  holdingAddresses: number | null
  chainSize: number | null
  mempoolBytes: number | null
  raw: Record<string, unknown>
}

type BcData = Record<string, any>

function toSummary(id: ChainId, d: BcData): ChainSummary {
  const chain = CHAINS.find((c) => c.id === id)!
  const price = d.market_price_usd ?? null
  const volRaw = d.volume_24h ?? d.volume_24h_approximate
  const volume24hUsd = volRaw != null && price != null ? (Number(volRaw) / 10 ** chain.decimals) * price : null
  return {
    id,
    price,
    change24h: d.market_price_usd_change_24h_percentage ?? null,
    marketCap: d.market_cap_usd ?? null,
    dominance: d.market_dominance_percentage ?? null,
    tx24h: d.transactions_24h ?? null,
    mempoolTx: d.mempool_transactions ?? null,
    tps: d.transactions_24h != null ? d.transactions_24h / 86400 : d.mempool_tps ?? null,
    avgFeeUsd: d.average_transaction_fee_usd_24h ?? null,
    medianFeeUsd: d.median_transaction_fee_usd_24h ?? null,
    height: d.best_block_height ?? d.best_ledger_height ?? null,
    lastBlockTime: d.best_block_time ?? d.best_ledger_time ?? null,
    blocks24h: d.blocks_24h ?? d.ledgers_24h ?? null,
    hashrate: d.hashrate_24h != null && Number(d.hashrate_24h) > 0 ? Number(d.hashrate_24h) : null,
    difficulty: d.difficulty || null,
    volume24hUsd,
    largestTxUsd: d.largest_transaction_24h?.value_usd ?? null,
    largestTxHash: d.largest_transaction_24h?.hash ?? null,
    nodes: d.nodes ?? null,
    holdingAddresses: d.hodling_addresses || null,
    chainSize: d.blockchain_size ?? null,
    mempoolBytes: d.mempool_size ?? null,
    raw: d,
  }
}

/** Blockchair 시간은 UTC 문자열 */
export const bcTime = (s: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z').getTime() : NaN)

export async function fetchOverview(): Promise<ChainSummary[]> {
  const [bc, sol] = await Promise.allSettled([
    getJSON<{ data: Record<string, { data: BcData }> }>('https://api.blockchair.com/stats'),
    fetchSolana(),
  ])
  const out: ChainSummary[] = []
  for (const c of CHAINS) {
    if (c.id === 'solana') {
      if (sol.status === 'fulfilled') out.push(sol.value)
      continue
    }
    if (bc.status === 'fulfilled') {
      const d = bc.value.data?.[c.id]?.data
      if (d) out.push(toSummary(c.id, d))
    }
  }
  if (!out.length) throw new Error('no data')
  return out
}

// ───────────── 솔라나 (공개 RPC + 시세) ─────────────
const SOL_RPCS = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com']
async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  let last: unknown
  for (const url of SOL_RPCS) {
    try {
      const r = await getJSON<{ result: T; error?: { message: string } }>(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      if (r.error) throw new Error(r.error.message)
      return r.result
    } catch (e) { last = e }
  }
  throw last
}

async function solPrice(): Promise<{ price: number; change: number | null; mcap: number | null }> {
  try {
    const r = await getJSON<any>('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true')
    return { price: r.solana.usd, change: r.solana.usd_24h_change ?? null, mcap: r.solana.usd_market_cap ?? null }
  } catch { /* 다음 소스 */ }
  try {
    const r = await getJSON<any>('https://api.exchange.coinbase.com/products/SOL-USD/stats')
    const last = Number(r.last), open = Number(r.open)
    return { price: last, change: open ? ((last - open) / open) * 100 : null, mcap: null }
  } catch { /* 다음 소스 */ }
  const r = await getJSON<any>('https://api.kraken.com/0/public/Ticker?pair=SOLUSD')
  const t = Object.values(r.result)[0] as any
  const last = Number(t.c[0]), open = Number(t.o)
  return { price: last, change: open ? ((last - open) / open) * 100 : null, mcap: null }
}

export interface SolanaExtra {
  epoch: number
  slotIndex: number
  slotsInEpoch: number
  absoluteSlot: number
  totalTx: number
  tpsSamples: { t: number; tps: number; nonVote: number }[]
}

export async function fetchSolana(): Promise<ChainSummary & { sol: SolanaExtra }> {
  const [epoch, perf, price] = await Promise.all([
    rpc<any>('getEpochInfo'),
    rpc<any[]>('getRecentPerformanceSamples', [60]),
    solPrice().catch(() => null),
  ])
  const now = Date.now()
  const samples = perf
    .map((p, i) => ({ t: now - i * 60_000, tps: p.numTransactions / p.samplePeriodSecs, nonVote: p.numNonVoteTransactions / p.samplePeriodSecs }))
    .reverse()
  const tpsAvg = samples.reduce((a, s) => a + s.tps, 0) / Math.max(1, samples.length)
  const blank = toSummary('solana', {})
  return {
    ...blank,
    price: price?.price ?? null,
    change24h: price?.change ?? null,
    marketCap: price?.mcap ?? null,
    height: epoch.blockHeight,
    lastBlockTime: null,
    tps: tpsAvg,
    tx24h: Math.round(tpsAvg * 86400),
    sol: {
      epoch: epoch.epoch,
      slotIndex: epoch.slotIndex,
      slotsInEpoch: epoch.slotsInEpoch,
      absoluteSlot: epoch.absoluteSlot,
      totalTx: epoch.transactionCount,
      tpsSamples: samples,
    },
  }
}

// ───────────── 비트코인 (mempool.space / blockchain.info) ─────────────
const MS = 'https://mempool.space/api'

export interface BtcLive {
  fees: { fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number; minimumFee: number }
  mempool: { count: number; vsize: number; total_fee: number }
  diff: { progressPercent: number; difficultyChange: number; estimatedRetargetDate: number; remainingBlocks: number; nextRetargetHeight: number; timeAvg: number }
  blocks: { height: number; timestamp: number; tx_count: number; size: number; pool: string; totalFees: number; medianFee: number; reward: number }[]
}

export async function fetchBtcLive(): Promise<BtcLive> {
  const [fees, mempool, diff, blocks] = await Promise.all([
    getJSON<BtcLive['fees']>(`${MS}/v1/fees/recommended`),
    getJSON<any>(`${MS}/mempool`),
    getJSON<BtcLive['diff']>(`${MS}/v1/difficulty-adjustment`),
    getJSON<any[]>(`${MS}/v1/blocks`),
  ])
  return {
    fees,
    mempool: { count: mempool.count, vsize: mempool.vsize, total_fee: mempool.total_fee },
    diff,
    blocks: blocks.slice(0, 10).map((b) => ({
      height: b.height, timestamp: b.timestamp, tx_count: b.tx_count, size: b.size,
      pool: b.extras?.pool?.name ?? '알 수 없음', totalFees: b.extras?.totalFees ?? 0,
      medianFee: b.extras?.medianFee ?? 0, reward: b.extras?.reward ?? 0,
    })),
  }
}

export type Range = '1m' | '3m' | '1y'
export interface Point { t: number; v: number }

const BCI_SPAN: Record<Range, string> = { '1m': '30days', '3m': '90days', '1y': '1year' }

export async function fetchBtcChart(metric: string, range: Range): Promise<Point[]> {
  if (metric === 'hash-rate') {
    const r = await getJSON<{ hashrates: { timestamp: number; avgHashrate: number }[] }>(`${MS}/v1/mining/hashrate/${range}`)
    return r.hashrates.map((h) => ({ t: h.timestamp * 1000, v: h.avgHashrate }))
  }
  const r = await getJSON<{ values: { x: number; y: number }[] }>(
    `https://api.blockchain.info/charts/${metric}?timespan=${BCI_SPAN[range]}&format=json&cors=true&sampled=true`,
  )
  return r.values.map((p) => ({ t: p.x * 1000, v: p.y }))
}

// ───────────── 이더리움 (Blockscout) ─────────────
const BS = 'https://eth.blockscout.com/api/v2'

export interface EthLive {
  gas: { slow: number; average: number; fast: number }
  utilization: number
  totalAddresses: number
  totalTx: number
  txToday: number
  blockTime: number
  blocks: { height: number; timestamp: string; tx: number; gasUsed: number; gasLimit: number; baseFee: number; burnt: number; builder: string }[]
}

export async function fetchEthLive(): Promise<EthLive> {
  const [s, blocks] = await Promise.all([getJSON<any>(`${BS}/stats`), getJSON<any[]>(`${BS}/main-page/blocks`)])
  return {
    gas: s.gas_prices ?? { slow: 0, average: 0, fast: 0 },
    utilization: s.network_utilization_percentage,
    totalAddresses: Number(s.total_addresses),
    totalTx: Number(s.total_transactions),
    txToday: Number(s.transactions_today),
    blockTime: s.average_block_time / 1000,
    blocks: blocks.map((b) => ({
      height: b.height, timestamp: b.timestamp, tx: b.transactions_count,
      gasUsed: Number(b.gas_used), gasLimit: Number(b.gas_limit),
      baseFee: Number(b.base_fee_per_gas) / 1e9, burnt: Number(b.burnt_fees) / 1e18,
      builder: b.miner?.ens_domain_name || b.miner?.metadata?.tags?.find((t: any) => t.tagType === 'name')?.name || b.miner?.hash,
    })),
  }
}

export async function fetchEthChart(metric: 'transactions' | 'price' | 'marketcap', range: Range): Promise<Point[]> {
  const days = range === '1m' ? 30 : range === '3m' ? 90 : 365
  const cut = Date.now() - days * 86400_000
  if (metric === 'transactions') {
    const r = await getJSON<{ chart_data: { date: string; transactions_count: number }[] }>(`${BS}/stats/charts/transactions`)
    return r.chart_data.map((p) => ({ t: Date.parse(p.date), v: p.transactions_count })).filter((p) => p.t >= cut).reverse()
  }
  const r = await getJSON<{ chart_data: { date: string; closing_price: string; market_cap: string }[] }>(`${BS}/stats/charts/market`)
  return r.chart_data
    .map((p) => ({ t: Date.parse(p.date), v: Number(metric === 'price' ? p.closing_price : p.market_cap) }))
    .filter((p) => p.t >= cut && isFinite(p.v))
    .reverse()
}

// ───────────── 주소 조회 ─────────────
export interface AddrTx {
  hash: string
  time: number | null
  /** 이 주소 기준 순변동 (코인 단위, +입금 / -출금) */
  delta: number
  fee: number
  confirmed: boolean
  note?: string
  /** 출금이면 받는 주소들, 입금이면 보낸 주소들 */
  counterparties: string[]
}

export interface AddrToken { symbol: string; name: string; balance: number; usd: number | null }

export interface AddrInfo {
  balance: number
  received: number | null
  sent: number | null
  txCount: number
  pendingTx: number
  tag: string | null
  isContract: boolean
  txs: AddrTx[]
  tokens: AddrToken[]
}

export function isValidAddress(chain: 'bitcoin' | 'ethereum', a: string) {
  if (chain === 'ethereum') return /^0x[0-9a-fA-F]{40}$/.test(a)
  return /^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(a)
}

export async function fetchAddress(chain: 'bitcoin' | 'ethereum', address: string): Promise<AddrInfo> {
  if (chain === 'bitcoin') {
    const [a, txs] = await Promise.all([getJSON<any>(`${MS}/address/${address}`), getJSON<any[]>(`${MS}/address/${address}/txs`)])
    const cs = a.chain_stats, ms = a.mempool_stats
    return {
      balance: (cs.funded_txo_sum - cs.spent_txo_sum + ms.funded_txo_sum - ms.spent_txo_sum) / 1e8,
      received: cs.funded_txo_sum / 1e8,
      sent: cs.spent_txo_sum / 1e8,
      txCount: cs.tx_count + ms.tx_count,
      pendingTx: ms.tx_count,
      tag: null,
      isContract: false,
      tokens: [],
      txs: txs.slice(0, 25).map((t) => {
        const out = t.vout.filter((o: any) => o.scriptpubkey_address === address).reduce((s: number, o: any) => s + o.value, 0)
        const inp = t.vin.filter((i: any) => i.prevout?.scriptpubkey_address === address).reduce((s: number, i: any) => s + i.prevout.value, 0)
        const delta = (out - inp) / 1e8
        const counterparties: string[] = delta < 0
          ? t.vout.filter((o: any) => o.scriptpubkey_address && o.scriptpubkey_address !== address).sort((a: any, b: any) => b.value - a.value).map((o: any) => o.scriptpubkey_address)
          : [...new Set<string>(t.vin.map((i: any) => i.prevout?.scriptpubkey_address).filter((a: string) => a && a !== address))]
        return { hash: t.txid, time: t.status.block_time ?? null, delta, fee: t.fee / 1e8, confirmed: t.status.confirmed, counterparties: counterparties.slice(0, 5) }
      }),
    }
  }
  const lower = address.toLowerCase()
  const [a, counters, txs] = await Promise.all([
    getJSON<any>(`${BS}/addresses/${address}`),
    getJSON<any>(`${BS}/addresses/${address}/counters`).catch(() => null),
    getJSON<any>(`${BS}/addresses/${address}/transactions`).catch(() => ({ items: [] })),
  ])
  const tag = a.metadata?.tags?.find((t: any) => t.tagType === 'name')?.name ?? a.ens_domain_name ?? a.name ?? null
  return {
    balance: Number(a.coin_balance ?? 0) / 1e18,
    received: null,
    sent: null,
    txCount: Number(counters?.transactions_count ?? 0),
    pendingTx: 0,
    tag,
    isContract: !!a.is_contract,
    txs: (txs.items ?? []).slice(0, 25).map((t: any) => {
      const v = Number(t.value) / 1e18
      const outgoing = t.from?.hash?.toLowerCase() === lower
      const incoming = t.to?.hash?.toLowerCase() === lower
      return {
        hash: t.hash,
        time: t.timestamp ? Date.parse(t.timestamp) : null,
        delta: outgoing && !incoming ? -v : incoming && !outgoing ? v : 0,
        fee: Number(t.fee?.value ?? 0) / 1e18,
        confirmed: t.status === 'ok' || t.result === 'success',
        note: t.method ?? undefined,
        counterparties: [outgoing ? t.to?.hash : t.from?.hash].filter(Boolean),
      }
    }),
    tokens: [],
  }
}

/** ERC-20 보유 토큰 — 응답이 느릴 수 있어 별도로 불러온다 */
export async function fetchEthTokens(address: string): Promise<AddrToken[]> {
  const r = await getJSON<any>(`${BS}/addresses/${address}/tokens?type=ERC-20`, undefined, 40000)
  return (r.items ?? [])
    .map((it: any) => {
      const dec = Number(it.token?.decimals ?? 18)
      const bal = Number(it.value) / 10 ** dec
      const rate = it.token?.exchange_rate ? Number(it.token.exchange_rate) : null
      return { symbol: it.token?.symbol ?? '?', name: it.token?.name ?? '', balance: bal, usd: rate != null ? rate * bal : null }
    })
    // 시세가 있는 토큰만 (스팸 토큰 제외)
    .filter((t: AddrToken) => t.balance > 0 && t.usd != null && t.usd >= 1)
    .sort((x: AddrToken, y: AddrToken) => (y.usd ?? 0) - (x.usd ?? 0))
    .slice(0, 20)
}

export function explorerUrl(chain: ChainId, kind: 'tx' | 'address', id: string) {
  if (chain === 'bitcoin') return `https://mempool.space/${kind}/${id}`
  if (chain === 'ethereum') return `https://eth.blockscout.com/${kind}/${id}`
  if (chain === 'solana') return `https://explorer.solana.com/${kind}/${id}`
  return `https://blockchair.com/${chain}/${kind === 'tx' ? 'transaction' : 'address'}/${id}`
}

// ───────────── 홈 상단 요약 ─────────────
export async function fetchPulse(): Promise<{ btcFee: number | null; ethGas: number | null; ethUtil: number | null }> {
  const [f, s] = await Promise.allSettled([getJSON<any>(`${MS}/v1/fees/recommended`), getJSON<any>(`${BS}/stats`)])
  return {
    btcFee: f.status === 'fulfilled' ? f.value.halfHourFee : null,
    ethGas: s.status === 'fulfilled' ? s.value.gas_prices?.average ?? null : null,
    ethUtil: s.status === 'fulfilled' ? s.value.network_utilization_percentage ?? null : null,
  }
}
