import { useMemo, useState } from 'react'
import { explorerUrl, useFetch } from '../lib/api'
import { ago, compact, money, num, shortHash } from '../lib/format'
import { useSettings, useWatch } from '../lib/store'
import { clearAlerts, markAllRead, useAlerts, type Alert } from '../lib/alerts'
import {
  AGE_BANDS, LTH_DAYS, fetchBtcWhales, fetchEthWhales, fetchStableFlows, interpret, interpretAge,
  type AgeSummary, type CoinAge, type FlowSummary, type Party, type WhaleKind, type WhaleTx,
} from '../lib/whale'
import { bcTime } from '../lib/api'
import { Term } from '../components/Term'
import { Header, RefreshButton, Section, Segmented, Skeleton, Updated, openExternal } from '../components/ui'
import { useFetch_overview } from './Home'

type Coin = 'bitcoin' | 'ethereum'

/** 거래 유형: 쉬운 이름 + 의미 */
const KIND: Record<WhaleKind, { l: string; c: string; mean: string }> = {
  deposit: { l: '📥 거래소로 보냄', c: '#ff5c6c', mean: '팔려고 준비하는 걸 수 있어요' },
  withdraw: { l: '📤 거래소에서 뺌', c: '#22c77a', mean: '오래 보관하려는 신호예요' },
  internal: { l: '🔁 거래소끼리 이동', c: '#8a94a8', mean: '거래소 내부 이동이라 큰 의미는 없어요' },
  consolidation: { l: '🧹 지갑 정리', c: '#c9a227', mean: '잔돈을 합치는 정리 작업이에요' },
  transfer: { l: '↔️ 개인 지갑끼리', c: '#6ea8ff', mean: '보관 장소를 옮긴 것일 수 있어요' },
}

const memo: { coin: Coin; min: Record<Coin, number> } = { coin: 'bitcoin', min: { bitcoin: 100, ethereum: 100 } }
const THRESH: Record<Coin, number[]> = { bitcoin: [100, 500, 1000], ethereum: [100, 500, 1000] }

function useIntro() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('whale:intro') === '0' } catch { return false } })
  return { hidden, hide: () => { setHidden(true); try { localStorage.setItem('whale:intro', '0') } catch { /* ignore */ } } }
}

export default function Whales({ onAddress }: { onAddress: (chain: Coin, address: string) => void }) {
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
  const intro = useIntro()

  const q = useFetch(
    `whale:${coin}:${m}:${Object.keys(userLabels).length}`,
    (): Promise<{ txs: WhaleTx[]; summary: FlowSummary; ages?: AgeSummary }> => (coin === 'bitcoin' ? fetchBtcWhales(m, userLabels) : fetchEthWhales(m, userLabels)),
    { maxAgeMs: 30_000 },
  )
  const stable = useFetch(coin === 'ethereum' ? 'stable-flow' : null, () => fetchStableFlows(), { maxAgeMs: 120_000 })

  const txs = (q.data?.txs ?? []).filter((t) => filter === 'all' || t.kind === filter)

  return (
    <div className="screen">
      <Header
        title="🐋 큰손(고래) 추적"
        sub={<Updated at={q.updatedAt} error={q.error} />}
        right={<RefreshButton loading={q.loading || stable.loading} onClick={() => { q.reload(); stable.reload() }} />}
      />
      <div className="content">
        {!intro.hidden && (
          <div className="card intro" style={{ marginTop: 6 }}>
            <button className="icon-btn x" onClick={intro.hide} aria-label="닫기">✕</button>
            <b>이 화면 보는 법</b>
            <ul>
              <li><Term k="whale">고래</Term> = 한 번에 수십억 원 이상 옮기는 큰손이에요.</li>
              <li>📥 <b>거래소로 보내면</b> → 팔려고 준비하는 신호일 수 있어요 (가격에 ↓ 부담)</li>
              <li>📤 <b>거래소에서 빼면</b> → 오래 들고 있으려는 신호예요 (가격에 ↑ 도움)</li>
              <li>⏳ <b>오래 묵힌 코인</b>이 움직이면 더 큰 신호예요</li>
            </ul>
          </div>
        )}

        <AlertInbox onAddress={onAddress} />

        <div className="seg wide">
          <button className={coin === 'bitcoin' ? 'on' : ''} onClick={() => { setCoin('bitcoin'); setFilter('all') }}>비트코인</button>
          <button className={coin === 'ethereum' ? 'on' : ''} onClick={() => { setCoin('ethereum'); setFilter('all') }}>이더리움</button>
        </div>
        <div className="kv">
          <span className="dim small">얼마 이상을 고래로 볼까요?</span>
          <Segmented
            value={String(m)}
            onChange={(v) => setMin({ ...min, [coin]: Number(v) })}
            options={THRESH[coin].map((t) => ({ v: String(t), l: `${num(t, 0)}개+` }))}
          />
        </div>
        {price && <div className="dim small" style={{ textAlign: 'right', marginTop: 2 }}>{num(m, 0)} {sym} ≈ {money(m * price, { compact: true })}</div>}

        {!q.data && !q.error && <Skeleton h={190} />}
        {!q.data && q.error && <div className="empty">{q.error}<br /><button className="btn" onClick={q.reload}>다시 시도</button></div>}
        {q.data && <FlowCard s={q.data.summary} sym={sym} price={price} coin={coin} />}

        {coin === 'bitcoin' && q.data?.ages && (
          <Section title="⏳ 오래 묵힌 코인이 나왔나?" right={<span className="dim small"><Term k="lth">장기보유자</Term> vs <Term k="sth">단기</Term></span>}>
            <AgeCard a={q.data.ages} />
            <NetworkAge raw={ov.data?.find((c) => c.id === 'bitcoin')?.raw} />
          </Section>
        )}

        {coin === 'ethereum' && (
          <Section title="💵 코인 살 돈이 거래소로 들어오나?" right={<span className="dim small"><Term k="stablecoin">달러코인</Term></span>}>
            {!stable.data && !stable.error && <Skeleton h={150} />}
            {!stable.data && stable.error && <div className="empty small">{stable.error}</div>}
            {stable.data && <StableCard f={stable.data} onAddress={(a) => onAddress('ethereum', a)} />}
          </Section>
        )}

        <Section title="큰손 거래 목록" right={<span className="dim small">{q.data ? `${txs.length}건` : ''}</span>}>
          <div className="chips">
            {(['all', 'deposit', 'withdraw', 'transfer', 'internal', ...(coin === 'bitcoin' ? ['consolidation'] : [])] as (WhaleKind | 'all')[]).map((k) => (
              <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>
                {k === 'all' ? '전체' : KIND[k].l}
              </button>
            ))}
          </div>
          <div className="list" style={{ marginTop: 10 }}>
            {q.data && txs.length === 0 && <div className="empty small">조건에 맞는 큰손 거래가 없어요.<br /><span className="dim">기준을 낮추거나 잠시 후 다시 확인해 보세요.</span></div>}
            {txs.map((t) => <WhaleRow key={t.hash} t={t} sym={sym} price={price} onAddress={(a) => onAddress(coin, a)} />)}
          </div>
          <p className="dim small pad">
            {coin === 'bitcoin'
              ? '최근 약 30분 동안 처리된 모든 비트코인 거래를 살펴봐요. 금액은 거스름돈을 뺀 실제로 옮긴 양이에요.'
              : '앱을 켜 둔 동안 새 거래를 계속 살펴보며 최대 약 15분치를 모아요. 이더리움을 직접 보낸 거래만 포함해요.'}
            {' '}거래소 지갑은 잘 알려진 주소와 거래가 아주 많은 주소(‘거래소 추정’)로 구분해요. 모든 거래소 지갑을 알아내지는 못해요. 주소를 누르면 그 지갑의 잔고와 기록을 볼 수 있어요.
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
      <div className="kv"><b>큰손들은 지금 팔려고 하나요?</b></div>
      <div className="dim small" style={{ marginTop: 2 }}>최근 약 {s.minutes}분 · 큰손 거래 {s.count}건 ({num(s.total, 0)} {sym})</div>
      <div className="flow-bar">
        {total > 0 && <div className="in" style={{ flex: s.inflow }} />}
        {total > 0 && <div className="out" style={{ flex: s.outflow }} />}
      </div>
      <div className="flow-legend">
        <div><span className="sw in" />📥 거래소로 들어감<b>{num(s.inflow, 1)} {sym}</b><small>{price ? money(s.inflow * price, { compact: true }) : ''} · 팔 준비</small></div>
        <div><span className="sw out" />📤 거래소에서 나감<b>{num(s.outflow, 1)} {sym}</b><small>{price ? money(s.outflow * price, { compact: true }) : ''} · 보관</small></div>
      </div>
      <div className="kv">
        <span>결과 (<Term k="netflow">순유입</Term>)</span>
        <b className={net > 0 ? 'down' : net < 0 ? 'up' : ''}>{net > 0 ? `거래소에 ${num(net, 1)} ${sym} 더 들어감` : net < 0 ? `거래소에서 ${num(-net, 1)} ${sym} 더 나감` : '같음'}</b>
      </div>
      <div className={'signal ' + it.tone}>{it.tone === 'bull' ? '🟢' : it.tone === 'bear' ? '🔴' : '⚪'} {it.text}</div>
      {coin === 'ethereum' && s.blocks < 20 && <div className="dim small" style={{ marginTop: 8 }}>앱을 켜 두면 살펴보는 시간이 점점 길어져요.</div>}
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
        <p className="explain">달러코인(USDT·USDC)은 코인 시장의 현금이에요. <b>거래소로 들어오면 코인을 살 돈이 준비된 것</b>, 빠져나가면 살 돈이 줄어든 거예요.</p>
        <div className="kv dim small"><span>최근 약 {num(f.hours, 0)}시간 · 주요 거래소 기준</span></div>
        <div className="flow-legend">
          <div><span className="sw" style={{ background: '#22c77a' }} />💵 거래소로 들어옴<b>{money(f.inflow, { compact: true })}</b><small>살 돈 증가</small></div>
          <div><span className="sw" style={{ background: '#ff5c6c' }} />거래소에서 나감<b>{money(f.outflow, { compact: true })}</b><small>살 돈 감소</small></div>
        </div>
        <div className="kv"><span>결과</span><b className={net > 0 ? 'up' : net < 0 ? 'down' : ''}>{net > 0 ? `살 돈 ${money(net, { compact: true })} 늘어남` : `살 돈 ${money(-net, { compact: true })} 줄어듦`}</b></div>
        <div className={'signal ' + it.tone}>{it.tone === 'bull' ? '🟢' : it.tone === 'bear' ? '🔴' : '⚪'} {it.text}</div>
        <div className="dim small" style={{ marginTop: 12 }}>거래소별 (초록 = 들어옴, 빨강 = 나감)</div>
        <div className="ex-bars">
          {f.byExchange.slice(0, 6).map((e) => (
            <div key={e.name} className="ex-row">
              <span className="ex-name">{e.name}</span>
              <div className="ex-track">
                <div style={{ width: `${(e.inflow / max) * 100}%`, background: '#22c77a' }} />
                <div style={{ width: `${(e.outflow / max) * 100}%`, background: '#ff5c6c' }} />
              </div>
              <span className="ex-net small">{e.inflow - e.outflow >= 0 ? '+' : '-'}{money(Math.abs(e.inflow - e.outflow), { compact: true })}</span>
            </div>
          ))}
        </div>
      </div>
      {f.big.length > 0 && (
        <div className="list" style={{ marginTop: 8 }}>
          {f.big.slice(0, 8).map((b) => (
            <div key={b.hash + b.dir + b.amount} className="whale-row">
              <div className="whale-top">
                <span className="badge" style={{ color: b.dir === 'in' ? '#22c77a' : '#ff5c6c', borderColor: b.dir === 'in' ? '#22c77a55' : '#ff5c6c55' }}>{b.exchange}{b.dir === 'in' ? '로 들어옴' : '에서 나감'}</span>
                <b>{money(b.amount, { compact: true })} <span className="dim small">{b.token}</span></b>
              </div>
              <div className="whale-route small">
                <button className="addr-chip" onClick={() => onAddress(b.counterparty)}>{shortHash(b.counterparty, 5)}</button>
                <span className="dim">{b.dir === 'in' ? '→' : '←'}</span>
                <span className="addr-chip ex">{b.exchange}</span>
                <button className="dim link" onClick={() => openExternal(explorerUrl('ethereum', 'tx', b.hash))}>기록 보기 ↗</button>
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
      {p.exchange ? `🏦 ${p.label}` : p.label ?? `👤 ${shortHash(p.address, 4)}`}
    </button>
  )
}

function Parties({ list, onAddress }: { list: Party[]; onAddress: (a: string) => void }) {
  const shown = list.slice(0, 2)
  return (
    <span className="parties">
      {shown.map((p) => <PartyChip key={p.address} p={p} onAddress={onAddress} />)}
      {list.length > 2 && <span className="dim small">외 {list.length - 2}곳</span>}
    </span>
  )
}

function WhaleRow({ t, sym, price, onAddress }: { t: WhaleTx; sym: string; price: number | null; onAddress: (a: string) => void }) {
  const k = KIND[t.kind]
  return (
    <div className={'whale-row' + (t.kind === 'deposit' ? ' hot' : '')}>
      <div className="whale-top">
        <span className="badge" style={{ color: k.c, borderColor: k.c + '55' }}>{k.l}{t.exchange && t.kind !== 'internal' ? ` · ${t.exchange}` : ''}</span>
        <span className="dim small">{t.time ? ago(t.time) : ''}</span>
      </div>
      <div className="whale-amt">
        <b>{num(t.amount, t.amount >= 1000 ? 0 : 2)} {sym}</b>
        <span className="dim">{price ? money(t.amount * price, { compact: true }) : ''}</span>
      </div>
      <div className="dim small">→ {k.mean}</div>
      {t.age && t.age.lth + t.age.sth > 0 && <AgeChip a={t.age} />}
      <div className="whale-route small">
        <span className="dim">보낸 곳</span>
        <Parties list={t.from} onAddress={onAddress} />
        <span className="dim">→ 받은 곳</span>
        <Parties list={t.to} onAddress={onAddress} />
      </div>
      <div className="whale-foot small">
        <button className="dim link" onClick={() => openExternal(explorerUrl(t.chain, 'tx', t.hash))}>거래 기록 보기 ↗</button>
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
        <span><b>🚨 큰손이 거래소로 보냈어요</b>{unread > 0 && <span className="new-dot">새 {unread}</span>}</span>
        {unread > 0 ? <button className="text-btn" onClick={markAllRead}>모두 확인</button> : alerts.length > 0 && <button className="text-btn dim" onClick={clearAlerts}>비우기</button>}
      </div>
      {!on && <div className="dim small">설정에서 알림을 켜면, 큰손이 거래소로 코인을 보낼 때(팔 준비 신호) 알려드려요.</div>}
      {on && alerts.length === 0 && <div className="dim small">아직 없어요. 큰손이 거래소로 코인을 보내면 여기와 휴대폰 알림으로 알려드려요.</div>}
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
          <span className="badge b-dep">{a.source === 'watch' ? '⭐ 내 관심 주소' : '🐋 큰손'} → 🏦 {a.exchange}</span>
          <b className="alert-amt">{num(a.amount, a.amount >= 1000 ? 0 : 2)} {sym}</b>
        </div>
        <div className="small whale-route">
          <button className="addr-chip" onClick={() => onAddress(a.chain, a.from)}>{a.fromLabel ?? shortHash(a.from, 5)}</button>
          {a.lthPct != null && <span style={{ color: a.lthPct >= 50 ? LTH_C : STH_C, fontWeight: 650 }}>{a.lthPct >= 50 ? `⏳ 오래 묵힌 코인 ${a.lthPct}%` : `🆕 최근 산 코인 ${100 - a.lthPct}%`}</span>}
          <span className="dim">{ago(a.time)}</span>
          <button className="dim link" onClick={() => openExternal(explorerUrl(a.chain, 'tx', a.hash))}>기록 ↗</button>
        </div>
      </div>
    </div>
  )
}

const fmtDays = (d: number) => (d >= 365 ? `${(d / 365).toFixed(1)}년` : d >= 30 ? `${Math.round(d / 30)}개월` : d >= 1 ? `${Math.round(d)}일` : `${Math.max(1, Math.round(d * 24))}시간`)
const LTH_C = '#b07cff'
const STH_C = '#3fc1e8'

function AgeChip({ a }: { a: CoinAge }) {
  const known = a.lth + a.sth
  const lthPct = Math.round((a.lth / known) * 100)
  return (
    <div className="age-chip small">
      <div className="age-mini"><div style={{ flex: a.lth, background: LTH_C }} /><div style={{ flex: a.sth, background: STH_C }} /></div>
      <span style={{ color: lthPct >= 50 ? LTH_C : STH_C, fontWeight: 650 }}>{lthPct >= 50 ? `⏳ 오래 묵힌 코인 ${lthPct}%` : `🆕 최근 산 코인 ${100 - lthPct}%`}</span>
      <span className="dim">평균 {fmtDays(a.avgDays)} 들고 있던 코인</span>
    </div>
  )
}

function AgeSplit({ a, title }: { a: CoinAge; title: string }) {
  const tot = a.lth + a.sth
  return (
    <div className="age-split">
      <div className="kv small"><b>{title}</b><span className="dim">{tot ? `평균 ${fmtDays(a.avgDays)} 들고 있던 코인` : ''}</span></div>
      {tot > 0 ? (
        <>
          <div className="flow-bar"><div style={{ flex: a.lth, background: LTH_C }} /><div style={{ flex: a.sth, background: STH_C }} /></div>
          <div className="flow-legend">
            <div><span className="sw" style={{ background: LTH_C }} />⏳ 오래 묵힌 코인<b>{num(a.lth, 1)} BTC</b><small>{Math.round((a.lth / tot) * 100)}% · 5개월 넘게 보유</small></div>
            <div><span className="sw" style={{ background: STH_C }} />🆕 최근 산 코인<b>{num(a.sth, 1)} BTC</b><small>{Math.round((a.sth / tot) * 100)}% · 5개월 미만</small></div>
          </div>
        </>
      ) : <div className="dim small" style={{ padding: '6px 0' }}>해당하는 코인이 없어요</div>}
    </div>
  )
}

function AgeCard({ a }: { a: AgeSummary }) {
  const it = interpretAge(a.all, a.toExchange)
  const max = Math.max(...a.all.bands, 1e-9)
  return (
    <div className="card">
      <p className="explain">
        비트코인은 코인마다 “언제 들어왔는지”가 기록돼요(<Term k="utxo">UTXO</Term>). 그래서 큰손이 옮긴 코인이 <b>오래 들고 있던 코인인지, 최근에 산 코인인지</b> 알 수 있어요.
        오래 묵힌 코인(약 5개월 넘게 들고 있던 코인)이 거래소로 가면 <b>노련한 투자자가 파는 큰 신호</b>예요.
      </p>
      <AgeSplit a={a.toExchange} title="🏦 거래소로 간 코인은?" />
      <div className="divider" />
      <AgeSplit a={a.all} title="🐋 큰손이 옮긴 코인 전체" />
      <div className={'signal ' + it.tone}>{it.tone === 'bear' ? '🔴' : it.tone === 'bull' ? '🟢' : '⚪'} {it.text}</div>
      <div className="bands">
        <div className="dim small" style={{ marginBottom: 6 }}>얼마나 오래 들고 있던 코인인가요? (BTC)</div>
        {AGE_BANDS.map((b, i) => (
          <div key={b.l} className="band-row small">
            <span className="band-l">{b.l}</span>
            <div className="band-track"><div style={{ width: `${(a.all.bands[i] / max) * 100}%`, background: b.max > LTH_DAYS ? LTH_C : STH_C }} /></div>
            <span className="band-v">{a.all.bands[i] ? num(a.all.bands[i], a.all.bands[i] >= 100 ? 0 : 1) : '-'}</span>
          </div>
        ))}
      </div>
      {a.all.unknown > 0 && <div className="dim small" style={{ marginTop: 6 }}>※ 아직 확인 못 한 {num(a.all.unknown, 1)} BTC는 빠져 있어요 (새로고침하면 더 확인해요)</div>}
      <div className="dim small" style={{ marginTop: 6 }}>거래소끼리 이동·지갑 정리는 파는 것과 관계없어서 뺐어요.</div>
    </div>
  )
}

/** 네트워크 전체: 오늘 움직인 코인의 평균 보관 기간 = CDD / 전송량 */
function NetworkAge({ raw }: { raw?: Record<string, any> }) {
  if (!raw?.cdd_24h || !raw?.volume_24h) return null
  const vol = Number(raw.volume_24h) / 1e8
  const avg = raw.cdd_24h / vol
  const t = bcTime(raw.best_block_time)
  return (
    <div className="card">
      <div className="kv"><b>오늘 전체 비트코인은?</b><span className="dim small">{isFinite(t) ? ago(t) : ''} · 24시간</span></div>
      <div className="grid" style={{ marginTop: 8 }}>
        <div className="stat"><div className="stat-label">움직인 코인의 평균 보관 기간</div><div className="stat-value" style={{ color: avg >= 30 ? LTH_C : undefined }}>{fmtDays(avg)}</div><div className="stat-sub">오늘 {compact(vol, 0)} BTC가 움직였어요</div></div>
        <div className="stat"><div className="stat-label"><Term k="cdd">깨어난 코인일</Term></div><div className="stat-value">{compact(raw.cdd_24h, 1)}</div><div className="stat-sub">코인 수 × 잠자던 날수</div></div>
      </div>
      <div className="dim small" style={{ marginTop: 8 }}>평균 보관 기간이 갑자기 길어지면, 오래 잠자던 코인들이 한꺼번에 깨어나 움직였다는 뜻이에요.</div>
    </div>
  )
}
