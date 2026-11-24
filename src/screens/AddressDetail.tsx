import { useState } from 'react'
import { explorerUrl, fetchAddress, fetchEthTokens, useFetch } from '../lib/api'
import { useBackHandler } from '../lib/back'
import { chainById } from '../lib/chains'
import { ago, money, num, shortHash } from '../lib/format'
import { addWatch, renameWatch, useWatch } from '../lib/store'
import { labelOf, probeActivity } from '../lib/whale'
import { useEffect } from 'react'
import { CoinIcon, Header, RefreshButton, Section, Skeleton, Stat, Updated, openExternal } from '../components/ui'
import { useFetch_overview } from './Home'

export default function AddressDetail({ chain, address, onBack }: { chain: 'bitcoin' | 'ethereum'; address: string; onBack: () => void }) {
  const info = chainById(chain)
  const watch = useWatch()
  const item = watch.find((w) => w.chain === chain && w.address.toLowerCase() === address.toLowerCase())
  const q = useFetch(`addr:${chain}:${address}`, () => fetchAddress(chain, address), { maxAgeMs: 60_000 })
  const ov = useFetch_overview()
  const price = ov.data?.find((c) => c.id === chain)?.price ?? null
  const d = q.data
  const tk = useFetch(chain === 'ethereum' ? `tokens:${address}` : null, () => fetchEthTokens(address), { refresh: false, maxAgeMs: 5 * 60_000 })

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  useBackHandler(editing, () => setEditing(false))
  const [copied, setCopied] = useState(false)
  // 거래 상대가 거래소인지 판별 (누적 거래 수 조회 후 다시 그리기)
  const [, setProbed] = useState(0)
  useEffect(() => {
    if (!d) return
    probeActivity(chain, d.txs.flatMap((t) => t.counterparties.slice(0, 2))).then(() => setProbed((x) => x + 1))
  }, [d, chain])

  const title = item?.label || d?.tag || shortHash(address, 5)

  return (
    <div className="screen">
      <Header
        title={<span className="title-coin"><CoinIcon symbol={info.symbol} color={info.color} size={26} />{title}</span>}
        sub={<Updated at={q.updatedAt} error={q.error} />}
        onBack={onBack}
        right={<RefreshButton loading={q.loading} onClick={q.reload} />}
      />
      <div className="content">
        <div className="hero">
          <div className="hero-price">{d ? num(d.balance, d.balance >= 1000 ? 2 : 6) : '-'} <small>{info.symbol}</small></div>
          <div className="hero-sub">{d && price ? money(d.balance * price) : ''}</div>
          <button className="addr mono" onClick={() => { navigator.clipboard?.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}>
            {address} <span className="dim">{copied ? '✓ 복사됨' : '⧉'}</span>
          </button>
        </div>

        <div className="actions">
          {item ? (
            editing ? (
              <form className="search" onSubmit={(e) => { e.preventDefault(); renameWatch(item.id, draft.trim()); setEditing(false) }}>
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={30} placeholder="이름" />
                <button type="button" className="btn ghost" onClick={() => setEditing(false)}>취소</button>
                <button className="btn">저장</button>
              </form>
            ) : (
              <button className="btn ghost" onClick={() => { setDraft(item.label); setEditing(true) }}>✎ 이름 수정</button>
            )
          ) : (
            <button className="btn" onClick={() => addWatch({ chain, address, label: d?.tag ?? '' })}>★ 관심 주소에 추가</button>
          )}
          {!editing && <button className="btn ghost" onClick={() => openExternal(explorerUrl(chain, 'address', address))}>탐색기 ↗</button>}
        </div>

        {!d && !q.error && <Skeleton h={160} />}
        {!d && q.error && <div className="empty">{q.error}<br /><button className="btn" onClick={q.reload}>다시 시도</button></div>}
        {d && (
          <>
            <div className="grid">
              <Stat label="거래 수" value={num(d.txCount, 0)} sub={d.pendingTx ? `대기 ${d.pendingTx}건` : undefined} />
              {d.received != null && <Stat label="총 입금" value={`${num(d.received, 4)}`} sub={info.symbol} />}
              {d.sent != null && <Stat label="총 출금" value={`${num(d.sent, 4)}`} sub={info.symbol} />}
              {chain === 'ethereum' && <Stat label="유형" value={d.isContract ? '컨트랙트' : '일반 지갑'} sub={d.tag ?? undefined} />}
            </div>

            {chain === 'ethereum' && (
              <Section title="보유 토큰 (ERC-20)">
                {!tk.data && !tk.error && <Skeleton h={60} />}
                {tk.error && !tk.data && <div className="empty small">토큰 정보를 불러오지 못했습니다</div>}
                {tk.data?.length === 0 && <div className="empty small">시세가 있는 보유 토큰이 없습니다</div>}
                <div className="list">
                  {(tk.data ?? []).map((t, i) => (
                    <div key={i} className="tx">
                      <div className="tx-main"><b>{t.symbol}</b> <span className="dim small">{t.name}</span></div>
                      <div className="tx-right">
                        <div>{num(t.balance, 4)}</div>
                        <div className="dim small">{t.usd != null ? money(t.usd, { compact: true }) : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="최근 거래">
              {d.txs.length === 0 && <div className="empty small">거래 내역이 없습니다</div>}
              <div className="list">
                {d.txs.map((t) => {
                  const ex = t.counterparties.map((c) => labelOf(c, {})).find((p) => p.exchange)
                  return (
                  <button key={t.hash} className={'tx' + (ex && t.delta < 0 ? ' hot' : '')} onClick={() => openExternal(explorerUrl(chain, 'tx', t.hash))}>
                    <div className="tx-main">
                      {ex && <span className={'badge ' + (t.delta < 0 ? 'b-dep' : 'b-wd')}>{t.delta < 0 ? `→ ${ex.label} 입금` : `${ex.label}에서 출금`}</span>}
                      <div className="mono">{shortHash(t.hash, 8)}</div>
                      <div className="dim small">{t.time ? ago(t.time) : '대기 중'}{t.note ? ` · ${t.note}` : ''}{!t.confirmed && t.time ? ' · 실패/대기' : ''}</div>
                    </div>
                    <div className="tx-right">
                      <div className={t.delta > 0 ? 'up' : t.delta < 0 ? 'down' : 'dim'}>{Math.abs(t.delta) < 5e-7 ? '0' : `${t.delta > 0 ? '+' : ''}${num(t.delta, 6)}`} {info.symbol}</div>
                      <div className="dim small">{price && t.delta ? money(Math.abs(t.delta) * price) : ''}</div>
                    </div>
                  </button>
                  )
                })}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
