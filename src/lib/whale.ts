/**
 * 고래(대형 거래) 추적 · 거래소 자금 흐름 분석
 * - BTC: mempool.space 블록 요약으로 최근 블록 전체 거래를 스캔 → 대형 거래 상세 조회 → 유형 분류
 * - ETH: 공개 RPC로 최근 블록을 증분 스캔 + USDT·USDC 거래소 입출금 로그 집계
 */

export type WhaleKind = 'deposit' | 'withdraw' | 'internal' | 'consolidation' | 'transfer'

export interface Party { address: string; label: string | null; exchange: boolean }

export interface WhaleTx {
  chain: 'bitcoin' | 'ethereum'
  hash: string
  time: number | null
  block: number | null
  /** 실제 이동량(거스름돈 제외, 코인 단위) */
  amount: number
  kind: WhaleKind
  exchange: string | null
  from: Party[]
  to: Party[]
  inputs: number
  outputs: number
}

export interface FlowSummary {
  count: number
  total: number
  inflow: number
  outflow: number
  blocks: number
  minutes: number
}

// ───── 알려진 거래소 지갑 (공개적으로 널리 알려진 주소) ─────
export const EXCHANGE_LABELS: Record<string, string> = {
  // Bitcoin
  '34xp4vrocgjym3xr7ycvpfhocnxv4twseo': 'Binance',
  '3m219kr5venenb47ewrpfwyb5jq2djxrp6': 'Binance',
  'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h': 'Binance',
  '3lyjfcfhpxyjremsask2jkn69lweykzexb': 'Binance',
  '1ndyjtntjmwk5xpnhjgamu4hdhigtobu1s': 'Binance',
  'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97': 'Bitfinex',
  // Ethereum
  '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance',
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': 'Binance',
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': 'Binance',
  '0xf977814e90da44bfa03b6295a0616a897441acec': 'Binance',
  '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8': 'Binance',
  '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be': 'Binance',
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase',
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': 'Coinbase',
  '0x503828976d22510aad0201ac7ec88293211d23da': 'Coinbase',
  '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740': 'Coinbase',
  '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': 'Kraken',
  '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0': 'Kraken',
  '0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec': 'Bitfinex',
  '0x742d35cc6634c0532925a3b844bc454e4438f44e': 'Bitfinex',
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': 'OKX',
  '0x390de26d772d2e2005c6d1d24afc902bae37a4bb': 'Upbit',
  '0xd24400ae8bfebb18ca49be86258a3c749cf46853': 'Gemini',
  '0xf89d7b9c864f589bbf53a82105107622b35eaa40': 'Bybit',
}

/** 거래 횟수가 매우 많은 주소 = 거래소·대형 서비스 지갑으로 추정 */
export const GUESS_LABEL = '거래소 추정'
const BTC_GUESS_TX = 10_000
const ETH_GUESS_NONCE = 50_000
const activity = new Map<string, number>()
try {
  const raw = localStorage.getItem('whale:activity')
  if (raw) Object.entries(JSON.parse(raw) as Record<string, number>).forEach(([k, v]) => activity.set(k, v))
} catch { /* ignore */ }
function saveActivity() {
  try {
    const entries = [...activity.entries()].slice(-2000)
    localStorage.setItem('whale:activity', JSON.stringify(Object.fromEntries(entries)))
  } catch { /* ignore */ }
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items]
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()!) }))
}

/** 주소들의 누적 거래 수를 조회해 '거래소 추정' 판별에 쓰도록 캐시 */
export async function probeActivity(chain: 'bitcoin' | 'ethereum', addrs: string[]) {
  const need = [...new Set(addrs.map((a) => a.toLowerCase()))].filter((a) => !activity.has(a) && !EXCHANGE_LABELS[a]).slice(0, 20)
  if (!need.length) return
  if (chain === 'bitcoin') {
    const orig = new Map(addrs.map((a) => [a.toLowerCase(), a]))
    await pool(need, 4, async (a) => {
      try {
        const r = await getJSON<any>(`${MS}/address/${orig.get(a)}`, undefined, 12000)
        activity.set(a, r.chain_stats.tx_count + r.mempool_stats.tx_count)
      } catch { /* 건너뜀 */ }
    })
  } else {
    try {
      const res = await rpcBatch(need.map((a) => ({ method: 'eth_getTransactionCount', params: [a, 'latest'] })))
      res.forEach((r, i) => activity.set(need[i], parseInt(r, 16)))
    } catch { /* 건너뜀 */ }
  }
  saveActivity()
}

const ETH_EXCHANGES = Object.keys(EXCHANGE_LABELS).filter((a) => a.startsWith('0x'))

export function labelOf(address: string, userLabels: Record<string, string>): Party {
  const k = address.toLowerCase()
  const ex = EXCHANGE_LABELS[k]
  const n = activity.get(k) ?? 0
  const guess = !ex && n >= (k.startsWith('0x') ? ETH_GUESS_NONCE : BTC_GUESS_TX)
  return { address, label: userLabels[k] ?? ex ?? (guess ? GUESS_LABEL : null), exchange: !!ex || guess }
}

function classify(fromEx: string | null, toEx: string | null, inputs: number, outputs: number): WhaleKind {
  if (fromEx && toEx) return 'internal'
  if (toEx) return 'deposit'
  if (fromEx) return 'withdraw'
  if (inputs >= 20 && outputs <= 2) return 'consolidation'
  return 'transfer'
}

async function getJSON<T>(url: string, init?: RequestInit, timeout = 25000): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally { clearTimeout(t) }
}

export function summarize(txs: WhaleTx[], blocks: number, minutes: number): FlowSummary {
  let inflow = 0, outflow = 0, total = 0
  for (const t of txs) {
    total += t.amount
    if (t.kind === 'deposit') inflow += t.amount
    if (t.kind === 'withdraw') outflow += t.amount
  }
  return { count: txs.length, total, inflow, outflow, blocks, minutes }
}

// ─────────────── BTC ───────────────
const MS = 'https://mempool.space/api'
const btcBlockCache = new Map<string, { height: number; time: number; big: { txid: string; value: number }[] }>()
const btcTxCache = new Map<string, any>()

/** 최근 blocks개 블록에서 minBtc 이상 거래 */
export async function fetchBtcWhales(minBtc: number, userLabels: Record<string, string>, blocks = 3): Promise<{ txs: WhaleTx[]; summary: FlowSummary }> {
  const recent = await getJSON<any[]>(`${MS}/v1/blocks`)
  const target = recent.slice(0, blocks)
  // 블록 요약은 캐시 — 새 블록만 받는다 (블록당 약 0.5MB)
  await Promise.all(target.map(async (b) => {
    if (btcBlockCache.has(b.id)) return
    const sum = await getJSON<{ txid: string; value: number }[]>(`${MS}/v1/block/${b.id}/summary`)
    // 최소 기준(50 BTC) 이상만 보관
    btcBlockCache.set(b.id, { height: b.height, time: b.timestamp, big: sum.slice(1).filter((t) => t.value >= 50e8) })
  }))
  const cand = target.flatMap((b) => {
    const c = btcBlockCache.get(b.id)!
    return c.big.filter((t) => t.value >= minBtc * 1e8).map((t) => ({ ...t, height: c.height, time: c.time }))
  })
  cand.sort((a, b) => b.value - a.value)
  const top = cand.slice(0, 30)
  const details = await Promise.all(top.map(async (t) => {
    if (!btcTxCache.has(t.txid)) {
      try { btcTxCache.set(t.txid, await getJSON<any>(`${MS}/tx/${t.txid}`)) } catch { return null }
    }
    return { meta: t, tx: btcTxCache.get(t.txid) }
  }))

  // 주요 입력/출력 주소의 누적 거래 수 조회 (캐시)
  const probe = new Set<string>()
  for (const d of details) {
    if (!d) continue
    const ins = d.tx.vin.map((v: any) => v.prevout?.scriptpubkey_address).filter(Boolean)
    if (ins[0]) probe.add(ins[0])
    d.tx.vout.filter((o: any) => o.scriptpubkey_address).sort((a: any, b: any) => b.value - a.value).slice(0, 2).forEach((o: any) => probe.add(o.scriptpubkey_address))
  }
  const need = [...probe].filter((a) => !activity.has(a.toLowerCase()) && !EXCHANGE_LABELS[a.toLowerCase()])
  await pool(need.slice(0, 40), 6, async (a) => {
    try {
      const r = await getJSON<any>(`${MS}/address/${a}`, undefined, 12000)
      activity.set(a.toLowerCase(), r.chain_stats.tx_count + r.mempool_stats.tx_count)
    } catch { /* 건너뜀 */ }
  })
  saveActivity()

  const txs: WhaleTx[] = []
  for (const d of details) {
    if (!d) continue
    const { tx, meta } = d
    const inAddrs = new Set<string>(tx.vin.map((v: any) => v.prevout?.scriptpubkey_address).filter(Boolean))
    const outs = tx.vout.filter((o: any) => o.scriptpubkey_address)
    // 거스름돈(입력 주소로 되돌아가는 출력)을 제외한 실제 이동량
    const moved = outs.filter((o: any) => !inAddrs.has(o.scriptpubkey_address))
    const amount = (moved.length ? moved : outs).reduce((s: number, o: any) => s + o.value, 0) / 1e8
    if (amount < minBtc) continue
    const fromParties = [...inAddrs].map((a) => labelOf(a, userLabels))
    const toAgg = new Map<string, number>()
    for (const o of moved.length ? moved : outs) toAgg.set(o.scriptpubkey_address, (toAgg.get(o.scriptpubkey_address) ?? 0) + o.value)
    const toParties = [...toAgg.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => labelOf(a, userLabels))
    const fromEx = fromParties.find((p) => p.exchange)?.label ?? null
    const toEx = toParties.find((p) => p.exchange)?.label ?? null
    txs.push({
      chain: 'bitcoin', hash: tx.txid, time: meta.time, block: meta.height, amount,
      kind: classify(fromEx, toEx, tx.vin.length, tx.vout.length),
      exchange: toEx ?? fromEx, from: fromParties, to: toParties,
      inputs: tx.vin.length, outputs: tx.vout.length,
    })
  }
  txs.sort((a, b) => (b.block ?? 0) - (a.block ?? 0) || b.amount - a.amount)
  const span = target.length ? (target[0].timestamp - target[target.length - 1].timestamp) / 60 + 10 : 0
  return { txs, summary: summarize(txs, target.length, Math.round(span)) }
}

// ─────────────── ETH ───────────────
const RPC = 'https://ethereum-rpc.publicnode.com'
async function rpcBatch(calls: { method: string; params: unknown[] }[]): Promise<any[]> {
  const body = calls.map((c, i) => ({ jsonrpc: '2.0', id: i, method: c.method, params: c.params }))
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  let r: any
  try { r = await getJSON<any>(RPC, init, 40000) } catch { r = await getJSON<any>(RPC, init, 40000) } // 1회 재시도
  const arr = Array.isArray(r) ? r : [r]
  return arr.sort((a, b) => a.id - b.id).map((x) => { if (x.error) throw new Error(x.error.message); return x.result })
}
const hex = (n: number) => '0x' + n.toString(16)

interface EthBlockLite { n: number; time: number; big: { hash: string; from: string; to: string | null; value: number }[] }
const ethBlocks = new Map<number, EthBlockLite>()

/** 최근 블록을 증분 스캔 (최초 maxNew개, 이후 새 블록만) */
export async function fetchEthWhales(minEth: number, userLabels: Record<string, string>, window = 75, maxNew = 8): Promise<{ txs: WhaleTx[]; summary: FlowSummary; head: number }> {
  const [headHex] = await rpcBatch([{ method: 'eth_blockNumber', params: [] }])
  const head = parseInt(headHex, 16)
  const want: number[] = []
  for (let n = head; n > head - window && want.length < maxNew; n--) if (!ethBlocks.has(n)) want.push(n)
  if (want.length) {
    const res = await rpcBatch(want.map((n) => ({ method: 'eth_getBlockByNumber', params: [hex(n), true] })))
    res.forEach((b) => {
      if (!b) return
      ethBlocks.set(parseInt(b.number, 16), {
        n: parseInt(b.number, 16), time: parseInt(b.timestamp, 16),
        // 10 ETH 이상만 보관 (메모리 절약)
        big: b.transactions
          .map((t: any) => ({ hash: t.hash, from: t.from, to: t.to, value: Number(BigInt(t.value)) / 1e18 }))
          .filter((t: any) => t.value >= 10),
      })
    })
  }
  for (const n of [...ethBlocks.keys()]) if (n <= head - window) ethBlocks.delete(n)
  const blocks = [...ethBlocks.values()].sort((a, b) => b.n - a.n)
  // 고래 거래 당사자의 nonce(보낸 거래 수) 조회 → 거래소 핫월렛 추정
  const addrs = new Set<string>()
  for (const b of blocks) for (const t of b.big) if (t.value >= minEth) { addrs.add(t.from.toLowerCase()); if (t.to) addrs.add(t.to.toLowerCase()) }
  const need = [...addrs].filter((a) => !activity.has(a) && !EXCHANGE_LABELS[a]).slice(0, 60)
  if (need.length) {
    try {
      const res = await rpcBatch(need.map((a) => ({ method: 'eth_getTransactionCount', params: [a, 'latest'] })))
      res.forEach((r, i) => activity.set(need[i], parseInt(r, 16)))
      saveActivity()
    } catch { /* 건너뜀 */ }
  }
  const txs: WhaleTx[] = []
  for (const b of blocks) for (const t of b.big) {
    if (t.value < minEth) continue
    const from = labelOf(t.from, userLabels)
    const to = t.to ? labelOf(t.to, userLabels) : { address: '(컨트랙트 생성)', label: null, exchange: false }
    txs.push({
      chain: 'ethereum', hash: t.hash, time: b.time, block: b.n, amount: t.value,
      kind: classify(from.exchange ? from.label : null, to.exchange ? to.label : null, 1, 1),
      exchange: (to.exchange ? to.label : null) ?? (from.exchange ? from.label : null),
      from: [from], to: [to], inputs: 1, outputs: 1,
    })
  }
  const minutes = blocks.length ? Math.round((blocks[0].time - blocks[blocks.length - 1].time) / 60 + 0.2) : 0
  return { txs, summary: summarize(txs, blocks.length, minutes), head }
}

// ───── 스테이블코인 거래소 흐름 (USDT·USDC) ─────
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const STABLES: Record<string, string> = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
}
const topicAddr = (a: string) => '0x' + '0'.repeat(24) + a.slice(2).toLowerCase()
const fromTopic = (t: string) => '0x' + t.slice(26)

export interface StableFlow {
  hours: number
  inflow: number
  outflow: number
  byExchange: { name: string; inflow: number; outflow: number }[]
  big: { hash: string; token: string; amount: number; dir: 'in' | 'out'; exchange: string; counterparty: string; block: number }[]
}

export async function fetchStableFlows(blocks = 900): Promise<StableFlow> {
  const [headHex] = await rpcBatch([{ method: 'eth_blockNumber', params: [] }])
  const head = parseInt(headHex, 16)
  const filt = (topics: unknown[]) => ({ fromBlock: hex(head - blocks), toBlock: hex(head), address: Object.keys(STABLES), topics })
  const exTopics = ETH_EXCHANGES.map(topicAddr)
  const [[ins], [outs]] = await Promise.all([
    rpcBatch([{ method: 'eth_getLogs', params: [filt([TRANSFER, null, exTopics])] }]),
    rpcBatch([{ method: 'eth_getLogs', params: [filt([TRANSFER, exTopics])] }]),
  ])
  const per = new Map<string, { inflow: number; outflow: number }>()
  const big: StableFlow['big'] = []
  let inflow = 0, outflow = 0
  const handle = (l: any, dir: 'in' | 'out') => {
    const from = fromTopic(l.topics[1]), to = fromTopic(l.topics[2])
    const fromEx = EXCHANGE_LABELS[from], toEx = EXCHANGE_LABELS[to]
    if (fromEx && toEx) return // 거래소 내부 이동 제외
    const amount = Number(BigInt(l.data)) / 1e6
    const ex = (dir === 'in' ? toEx : fromEx)!
    const e = per.get(ex) ?? { inflow: 0, outflow: 0 }
    if (dir === 'in') { e.inflow += amount; inflow += amount } else { e.outflow += amount; outflow += amount }
    per.set(ex, e)
    if (amount >= 1_000_000) big.push({ hash: l.transactionHash, token: STABLES[l.address.toLowerCase()] ?? '?', amount, dir, exchange: ex, counterparty: dir === 'in' ? from : to, block: parseInt(l.blockNumber, 16) })
  }
  ins.forEach((l: any) => handle(l, 'in'))
  outs.forEach((l: any) => handle(l, 'out'))
  big.sort((a, b) => b.block - a.block)
  return {
    hours: (blocks * 12) / 3600,
    inflow, outflow,
    byExchange: [...per.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.inflow + b.outflow - (a.inflow + a.outflow)),
    big: big.slice(0, 30),
  }
}

/** 순유입/순유출에 따른 해석 문구 */
export function interpret(inflow: number, outflow: number, kind: 'coin' | 'stable'): { tone: 'bull' | 'bear' | 'neutral'; text: string } {
  const total = inflow + outflow
  if (total === 0) return { tone: 'neutral', text: '해당 구간에 거래소 관련 고래 이동이 감지되지 않았습니다.' }
  const r = (inflow - outflow) / total
  if (Math.abs(r) < 0.15) return { tone: 'neutral', text: '거래소 입금과 출금이 비슷합니다. 뚜렷한 방향성이 없습니다.' }
  if (kind === 'coin') {
    return r > 0
      ? { tone: 'bear', text: '거래소로 들어가는 물량이 더 많습니다. 매도 대기 물량이 늘어 단기 매도 압력이 커질 수 있습니다.' }
      : { tone: 'bull', text: '거래소에서 빠져나가는 물량이 더 많습니다. 개인 지갑 보관(장기 보유·축적) 신호로 해석되곤 합니다.' }
  }
  return r > 0
    ? { tone: 'bull', text: '스테이블코인이 거래소로 유입되고 있습니다. 코인 매수 대기 자금이 늘고 있다는 신호로 해석되곤 합니다.' }
    : { tone: 'bear', text: '스테이블코인이 거래소에서 빠져나가고 있습니다. 매수 대기 자금이 줄어드는 흐름입니다.' }
}
