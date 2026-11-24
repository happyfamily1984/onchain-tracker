import { useMemo, useState } from 'react'
import { explorerUrl, useFetch } from '../lib/api'
import { ago, compact, money, num, shortHash } from '../lib/format'
import { useSettings, useWatch } from '../lib/store'
import { clearAlerts, markAllRead, useAlerts, type Alert } from '../lib/alerts'
import {
  fetchBtcWhales, fetchEthWhales, fetchStableFlows, interpret,
  type FlowSummary, type Party, type WhaleKind, type WhaleTx,
} from '../lib/whale'
import { Header, RefreshButton, Section, Segmented, Skeleton, Updated, openExternal } from '../components/ui'
import { useFetch_overview } from './Home'

type Coin = 'bitcoin' | 'ethereum'

const KIND: Record<WhaleKind, { l: string; c: string }> = {
  deposit: { l: '고래 → 거래소 입금', c: '#ff5c6c' },
  withdraw: { l: '거래소 출금', c: '#22c77a' },
  internal: { l: '거래소 간 이동', c: '#8a94a8' },
  consolidation: { l: 'UTXO 통합', c: '#c9a227' },
  transfer: { l: '지갑 간 이동', c: '#6ea8ff' },
}

const memo: { coin: Coin; min: Record<Coin, number> } = { coin: 'bitcoin', min: { bitcoin: 100, ethereum: 100 } }

const THRESH: Record<Coin, number[]> = { bitcoin: [100, 500, 1000], ethereum: [100, 500, 1000] }

export default function Whales({ onAddress }: { onAddress: (chain: Coin, address: string) => void }) {
  // 주소 상세에 다녀와도 선택 유지
  const [coin, setCoinState] = useState<Coin>(memo.coin)
  const [min, setMinState] = useState<Record<Coin, number>>(memo.min)
  const setCoin = (c: Coin) => { memo.coin = c; setCoinState(c) }
  const setMin = (v: Record<Coin, number>) => { memo.min = v; setMinState(v) }
  const [filter, setFilter] = useState<WhaleKind | 'all'>('all')
  const watch = useWatch()
  const userLabels = useMemo(() => Object.fromEntries(watch.filter((w) => w.label).map((w) => [w.address.toLowerCase(), w.label])), [watch])
  const ov = useFetch_overview()
  const price = ov.data?.find((c) => c.id === coin)?.price ?? null
  const sym = coin === 'bitcoin' ? 'BTC' : 'ETH'
  const m = min[coin]

  const q = useFetch(
    `whale:${coin}:${m}:${Object.keys(userLabels).length}`,
    () => (coin === 'bitcoin' ? fetchBtcWhales(m, userLabels) : fetchEthWhales(m, userLabels)),
    { maxAgeMs: 30_000 },
  )
  const stable = useFetch(coin === 'ethereum' ? 'stable-flow' : null, () => fetchStableFlows(), { maxAgeMs: 120_000 })

  const txs = (q.data?.txs ?? []).filter((t) => filter === 'all' || t.kind === filter)

  return (
    <div className="screen">
      <Header
        title="고래 추적"
        sub={<Updated at={q.updatedAt} error={q.error} />}
        right={<RefreshButton loading={q.loading || stable.loading} onClick={() => { q.reload(); stable.reload() }} />}
      />
      <div className="content">
        <AlertInbox onAddress={onAddress} />

        <div className="seg wide">
          <button className={coin === 'bitcoin' ? 'on' : ''} onClick={() => { setCoin('bitcoin'); setFilter('all') }}>비트코인</button>
          <button className={coin === 'ethereum' ? 'on' : ''} onClick={() => { setCoin('ethereum'); setFilter('all') }}>이더리움</button>
        </div>
        <div className="kv">
          <span className="dim small">고래 기준</span>
          <Segmented
            value={String(m)}
            onChange={(v) => setMin({ ...min, [coin]: Number(v) })}
            options={THRESH[coin].map((t) => ({ v: String(t), l: `${num(t, 0)} ${sym}+` }))}
          />
        </div>

        {!q.data && !q.error && <Skeleton h={190} />}
        {!q.data && q.error && <div className="empty">{q.error}<br /><button className="btn" onClick={q.reload}>다시 시도</button></div>}
        {q.data && <FlowCard s={q.data.summary} sym={sym} price={price} coin={coin} />}

        {coin === 'ethereum' && (
          <Section title="스테이블코인 거래소 흐름" right={<span className="dim small">USDT·USDC</span>}>
            {!stable.data && !stable.error && <Skeleton h={150} />}
            {!stable.data && stable.error && <div className="empty small">{stable.error}</div>}
            {stable.data && <StableCard f={stable.data} onAddress={(a) => onAddress('ethereum', a)} />}
          </Section>
        )}

        <Section title="대형 거래" right={<span className="dim small">{q.data ? `${txs.length}건` : ''}</span>}>
          <div className="chips">
            {(['all', 'deposit', 'withdraw', 'transfer', 'internal', ...(coin === 'bitcoin' ? ['consolidation'] : [])] as (WhaleKind | 'all')[]).map((k) => (
              <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>
                {k === 'all' ? '전체' : KIND[k].l}
              </button>
            ))}
          </div>
          <div className="list" style={{ marginTop: 10 }}>
            {q.data && txs.length === 0 && <div className="empty small">조건에 맞는 고래 거래가 없습니다.<br /><span className="dim">기준을 낮추거나 잠시 후 다시 확인하세요.</span></div>}
            {txs.map((t) => <WhaleRow key={t.hash} t={t} sym={sym} price={price} onAddress={(a) => onAddress(coin, a)} />)}
          </div>
          <p className="dim small pad">
            {coin === 'bitcoin'
              ? '최근 블록에 포함된 모든 거래를 스캔합니다. 금액은 거스름돈을 제외한 실제 이동량입니다.'
              : '앱을 열어 둔 동안 새 블록을 계속 스캔해 최대 약 15분치 기록을 쌓습니다. ETH 직접 전송만 포함됩니다.'}
            {' '}거래소 구분은 널리 알려진 거래소 지갑과, 누적 거래가 매우 많은 주소(‘거래소 추정’) 기준이며 모든 거래소 지갑을 식별하지는 못합니다. 관심 주소에 붙인 이름도 표시됩니다.
          </p>
        </Section>
      </div>
    </div>
  )
}

function FlowCard({ s, sym, price, coin }: { s: FlowSummary; sym: string; price: number | null; coin: Coin }) {
  const net = s.inflow - s.outflow
  const total = s.inflow + s.outflow
  const it = interpret(s.inflow, s.outflow, 'coin')
  return (
    <div className="card flow">
      <div className="kv dim small">
        <span>최근 {s.blocks}블록 · 약 {s.minutes}분</span>
        <span>고래 거래 {s.count}건 · {num(s.total, 0)} {sym}</span>
      </div>
      <div className="flow-bar">
        {total > 0 && <div className="in" style={{ flex: s.inflow }} />}
        {total > 0 && <div className="out" style={{ flex: s.outflow }} />}
      </div>
      <div className="flow-legend">
        <div><span className="sw in" />거래소 입금<b>{num(s.inflow, 1)} {sym}</b><small>{price ? money(s.inflow * price, { compact: true }) : ''}</small></div>
        <div><span className="sw out" />거래소 출금<b>{num(s.outflow, 1)} {sym}</b><small>{price ? money(s.outflow * price, { compact: true }) : ''}</small></div>
      </div>
      <div className="kv"><span>순유입</span><b className={net > 0 ? 'down' : net < 0 ? 'up' : ''}>{net > 0 ? '+' : ''}{num(net, 1)} {sym}</b></div>
      <div className={'signal ' + it.tone}>{it.tone === 'bull' ? '🟢' : it.tone === 'bear' ? '🔴' : '⚪'} {it.text}</div>
      {coin === 'ethereum' && s.blocks < 20 && <div className="dim small" style={{ marginTop: 8 }}>앱을 열어 두면 분석 구간이 점점 길어집니다.</div>}
    </div>
  )
}

function StableCard({ f, onAddress }: { f: Awaited<ReturnType<typeof fetchStableFlows>>; onAddress: (a: string) => void }) {
  const it = interpret(f.inflow, f.outflow, 'stable')
  const net = f.inflow - f.outflow
  const max = Math.max(1, ...f.byExchange.map((e) => Math.max(e.inflow, e.outflow)))
  return (
    <>
      <div className="card flow">
        <div className="kv dim small"><span>최근 약 {num(f.hours, 0)}시간 · 주요 거래소 지갑 기준</span></div>
        <div className="flow-legend">
          <div><span className="sw" style={{ background: '#22c77a' }} />거래소 유입<b>${compact(f.inflow, 2)}</b></div>
          <div><span className="sw" style={{ background: '#ff5c6c' }} />거래소 유출<b>${compact(f.outflow, 2)}</b></div>
        </div>
        <div className="kv"><span>순유입</span><b className={net > 0 ? 'up' : net < 0 ? 'down' : ''}>{net > 0 ? '+' : '-'}${compact(Math.abs(net), 2)}</b></div>
        <div className={'signal ' + it.tone}>{it.tone === 'bull' ? '🟢' : it.tone === 'bear' ? '🔴' : '⚪'} {it.text}</div>
        <div className="ex-bars">
          {f.byExchange.slice(0, 6).map((e) => (
            <div key={e.name} className="ex-row">
              <span className="ex-name">{e.name}</span>
              <div className="ex-track">
                <div style={{ width: `${(e.inflow / max) * 100}%`, background: '#22c77a' }} />
                <div style={{ width: `${(e.outflow / max) * 100}%`, background: '#ff5c6c' }} />
              </div>
              <span className="ex-net small">{e.inflow - e.outflow >= 0 ? '+' : '-'}${compact(Math.abs(e.inflow - e.outflow), 1)}</span>
            </div>
          ))}
        </div>
      </div>
      {f.big.length > 0 && (
        <div className="list" style={{ marginTop: 8 }}>
          {f.big.slice(0, 8).map((b) => (
            <div key={b.hash + b.dir + b.amount} className="whale-row">
              <div className="whale-top">
                <span className="badge" style={{ color: b.dir === 'in' ? '#22c77a' : '#ff5c6c', borderColor: b.dir === 'in' ? '#22c77a55' : '#ff5c6c55' }}>{b.exchange} {b.dir === 'in' ? '유입' : '유출'}</span>
                <b>${compact(b.amount, 2)} <span className="dim small">{b.token}</span></b>
              </div>
              <div className="whale-route small">
                <button className="addr-chip" onClick={() => onAddress(b.counterparty)}>{shortHash(b.counterparty, 5)}</button>
                <span className="dim">{b.dir === 'in' ? '→' : '←'}</span>
                <span className="addr-chip ex">{b.exchange}</span>
                <button className="dim link" onClick={() => openExternal(explorerUrl('ethereum', 'tx', b.hash))}>거래 ↗</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function PartyChip({ p, onAddress }: { p: Party; onAddress: (a: string) => void }) {
  if (!p.address.startsWith('0x') && p.address.startsWith('(')) return <span className="addr-chip">{p.address}</span>
  return (
    <button className={'addr-chip' + (p.exchange ? ' ex' : p.label ? ' mine' : '')} onClick={() => onAddress(p.address)}>
      {p.label ?? shortHash(p.address, 5)}
    </button>
  )
}

function Parties({ list, onAddress }: { list: Party[]; onAddress: (a: string) => void }) {
  const shown = list.slice(0, 2)
  return (
    <span className="parties">
      {shown.map((p) => <PartyChip key={p.address} p={p} onAddress={onAddress} />)}
      {list.length > 2 && <span className="dim small">외 {list.length - 2}</span>}
    </span>
  )
}

function WhaleRow({ t, sym, price, onAddress }: { t: WhaleTx; sym: string; price: number | null; onAddress: (a: string) => void }) {
  const k = KIND[t.kind]
  return (
    <div className={'whale-row' + (t.kind === 'deposit' ? ' hot' : '')}>
      <div className="whale-top">
        <span className="badge" style={{ color: k.c, borderColor: k.c + '55' }}>{t.kind === 'deposit' ? '🚨 ' : ''}{k.l}{t.exchange && t.kind !== 'internal' ? ` · ${t.exchange}` : ''}</span>
        <span className="dim small">{t.time ? ago(t.time) : ''} · #{num(t.block, 0)}</span>
      </div>
      <div className="whale-amt">
        <b>{num(t.amount, t.amount >= 1000 ? 0 : 2)} {sym}</b>
        <span className="dim">{price ? money(t.amount * price, { compact: true }) : ''}</span>
      </div>
      <div className="whale-route small">
        <Parties list={t.from} onAddress={onAddress} />
        <span className="dim">→</span>
        <Parties list={t.to} onAddress={onAddress} />
      </div>
      <div className="whale-foot small">
        {t.chain === 'bitcoin' && <span className="dim">입력 {t.inputs} · 출력 {t.outputs}</span>}
        <button className="dim link" onClick={() => openExternal(explorerUrl(t.chain, 'tx', t.hash))}>{shortHash(t.hash, 6)} ↗</button>
      </div>
    </div>
  )
}

function AlertInbox({ onAddress }: { onAddress: (chain: Coin, address: string) => void }) {
  const alerts = useAlerts()
  const st = useSettings()
  const [all, setAll] = useState(false)
  const unread = alerts.filter((a) => !a.read).length
  const on = st.alertBtc || st.alertEth || st.alertWatch
  const list = all ? alerts.slice(0, 50) : alerts.slice(0, 4)
  return (
    <div className={'card inbox' + (unread ? ' has-new' : '')}>
      <div className="kv">
        <span><b>🚨 거래소 입금 감지</b>{unread > 0 && <span className="new-dot">새 {unread}</span>}</span>
        {unread > 0 ? <button className="text-btn" onClick={markAllRead}>모두 확인</button> : alerts.length > 0 && <button className="text-btn dim" onClick={clearAlerts}>비우기</button>}
      </div>
      {!on && <div className="dim small">설정에서 고래 입금 알림을 켜면 고래 지갑이 거래소로 옮길 때 알려드립니다.</div>}
      {on && alerts.length === 0 && <div className="dim small">아직 감지된 입금이 없습니다. 고래 지갑 → 거래소 입금이 생기면 여기와 알림으로 알려드립니다.</div>}
      <div className="inbox-list">
        {list.map((a) => <AlertRow key={a.id} a={a} onAddress={onAddress} />)}
      </div>
      {alerts.length > 4 && <button className="text-btn full-w" onClick={() => setAll(!all)}>{all ? '접기' : `전체 ${alerts.length}건 보기`}</button>}
    </div>
  )
}

function AlertRow({ a, onAddress }: { a: Alert; onAddress: (chain: Coin, address: string) => void }) {
  const sym = a.chain === 'bitcoin' ? 'BTC' : 'ETH'
  return (
    <div className={'alert-row' + (a.read ? '' : ' unread')}>
      <div className="alert-main">
        <div>
          <span className="badge b-dep">{a.source === 'watch' ? '관심 주소' : '고래'} → {a.exchange}</span>
          <b className="alert-amt">{num(a.amount, a.amount >= 1000 ? 0 : 2)} {sym}</b>
        </div>
        <div className="small whale-route">
          <button className="addr-chip" onClick={() => onAddress(a.chain, a.from)}>{a.fromLabel ?? shortHash(a.from, 5)}</button>
          <span className="dim">{ago(a.time)}</span>
          <button className="dim link" onClick={() => openExternal(explorerUrl(a.chain, 'tx', a.hash))}>거래 ↗</button>
        </div>
      </div>
    </div>
  )
}
