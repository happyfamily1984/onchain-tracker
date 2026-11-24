import { useRef, useState } from 'react'
import { fetchAddress, isValidAddress, useFetch } from '../lib/api'
import { useBackHandler } from '../lib/back'
import { chainById } from '../lib/chains'
import { money, num, shortHash } from '../lib/format'
import { addWatch, removeWatch, useWatch, type WatchItem } from '../lib/store'
import { CoinIcon, Dialog, Header, Sheet } from '../components/ui'
import { useFetch_overview } from './Home'

const SUGGEST: { chain: 'bitcoin' | 'ethereum'; address: string; label: string }[] = [
  { chain: 'bitcoin', address: '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo', label: '바이낸스 콜드월렛' },
  { chain: 'bitcoin', address: 'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97', label: '비트파이넥스 콜드월렛' },
  { chain: 'ethereum', address: '0x00000000219ab540356cBB839Cbe05303d7705Fa', label: 'ETH2 예치 컨트랙트' },
  { chain: 'ethereum', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: '비탈릭 부테린' },
]

export default function Watchlist({ onOpen }: { onOpen: (w: WatchItem) => void }) {
  const watch = useWatch()
  const [adding, setAdding] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [confirmDel, setConfirmDel] = useState(false)

  const exitSelect = () => { setSelecting(false); setSel([]) }
  useBackHandler(selecting, exitSelect)

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="screen">
      {selecting ? (
        <Header
          title={`${sel.length}개 선택`}
          onBack={exitSelect}
          right={
            <>
              <button className="text-btn" onClick={() => setSel(sel.length === watch.length ? [] : watch.map((w) => w.id))}>{sel.length === watch.length ? '선택 해제' : '전체 선택'}</button>
              <button className="text-btn danger" disabled={!sel.length} onClick={() => setConfirmDel(true)}>삭제</button>
            </>
          }
        />
      ) : (
        <Header title="관심 주소" sub="고래·거래소·내 지갑 잔고 추적" right={watch.length > 0 && <button className="text-btn" onClick={() => setSelecting(true)}>편집</button>} />
      )}
      <div className="content">
        {watch.length === 0 && (
          <div className="empty">
            <div className="empty-ico">👀</div>
            추적할 비트코인·이더리움 주소를 추가하세요.<br />
            <span className="dim small">길게 누르면 여러 개를 선택해 삭제할 수 있어요.</span>
            <button className="btn" onClick={() => setAdding(true)}>주소 추가</button>
          </div>
        )}
        <div className="list">
          {watch.map((w) => (
            <WatchRow
              key={w.id}
              w={w}
              selecting={selecting}
              checked={sel.includes(w.id)}
              onClick={() => (selecting ? toggle(w.id) : onOpen(w))}
              onLong={() => { if (!selecting) { setSelecting(true); setSel([w.id]) } }}
            />
          ))}
        </div>
      </div>
      {!selecting && watch.length > 0 && (
        <button className="fab" onClick={() => setAdding(true)} aria-label="주소 추가">＋</button>
      )}
      <AddSheet open={adding} onClose={() => setAdding(false)} />
      <Dialog
        open={confirmDel}
        title="주소 삭제"
        onClose={() => setConfirmDel(false)}
        actions={<>
          <button className="text-btn" onClick={() => setConfirmDel(false)}>취소</button>
          <button className="text-btn danger" onClick={() => { removeWatch(sel); setConfirmDel(false); exitSelect() }}>삭제</button>
        </>}
      >
        선택한 {sel.length}개 주소를 관심 목록에서 삭제할까요?
      </Dialog>
    </div>
  )
}

function WatchRow({ w, selecting, checked, onClick, onLong }: { w: WatchItem; selecting: boolean; checked: boolean; onClick: () => void; onLong: () => void }) {
  const info = chainById(w.chain)
  const q = useFetch(`addr:${w.chain}:${w.address}`, () => fetchAddress(w.chain, w.address), { maxAgeMs: 60_000 })
  const ov = useFetch_overview()
  const price = ov.data?.find((c) => c.id === w.chain)?.price ?? null
  const timer = useRef<number | null>(null)
  const longFired = useRef(false)

  const start = () => {
    longFired.current = false
    timer.current = window.setTimeout(() => { longFired.current = true; navigator.vibrate?.(20); onLong() }, 500)
  }
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }

  return (
    <button
      className={'row' + (checked ? ' checked' : '')}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (longFired.current) { longFired.current = false; return } onClick() }}
    >
      {selecting && <span className={'check' + (checked ? ' on' : '')}>{checked ? '✓' : ''}</span>}
      <CoinIcon symbol={info.symbol} color={info.color} />
      <div className="row-main">
        <div className="row-top">
          <span className="row-name">{w.label || shortHash(w.address)}</span>
          <span className="row-price">{q.data ? `${num(q.data.balance, 4)} ${info.symbol}` : q.error ? '오류' : '…'}</span>
        </div>
        <div className="row-bottom">
          <span className="row-meta mono">{shortHash(w.address, 6)}</span>
          <span className="row-meta">{q.data && price ? money(q.data.balance * price, { compact: true }) : ''}</span>
        </div>
      </div>
    </button>
  )
}

export function AddSheet({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: { chain: 'bitcoin' | 'ethereum'; address: string } }) {
  const [chain, setChain] = useState<'bitcoin' | 'ethereum'>(preset?.chain ?? 'bitcoin')
  const [address, setAddress] = useState(preset?.address ?? '')
  const [label, setLabel] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const watch = useWatch()

  const close = () => { setAddress(preset?.address ?? ''); setLabel(''); setMsg(null); onClose() }
  const a = address.trim()
  const valid = isValidAddress(chain, a)

  const submit = (c = chain, addr = a, l = label) => {
    if (!isValidAddress(c, addr)) { setMsg('주소 형식이 올바르지 않습니다'); return }
    if (!addWatch({ chain: c, address: addr, label: l.trim() })) { setMsg('이미 추가된 주소입니다'); return }
    close()
  }

  return (
    <Sheet open={open} title="관심 주소 추가" onClose={close}>
      <div className="seg wide">
        <button className={chain === 'bitcoin' ? 'on' : ''} onClick={() => { setChain('bitcoin'); setMsg(null) }}>비트코인</button>
        <button className={chain === 'ethereum' ? 'on' : ''} onClick={() => { setChain('ethereum'); setMsg(null) }}>이더리움</button>
      </div>
      <label className="field">
        <span>주소</span>
        <input value={address} onChange={(e) => { setAddress(e.target.value); setMsg(null) }} placeholder={chain === 'bitcoin' ? 'bc1… / 1… / 3…' : '0x…'} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
      </label>
      <label className="field">
        <span>이름 (선택)</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 내 지갑, 거래소 콜드월렛" maxLength={30} />
      </label>
      {msg && <div className="err small">{msg}</div>}
      <button className="btn full" disabled={!valid} onClick={() => submit()}>추가</button>
      <div className="suggest">
        <div className="dim small">유명 주소 빠르게 추가</div>
        {SUGGEST.filter((s) => !watch.some((w) => w.address.toLowerCase() === s.address.toLowerCase())).map((s) => (
          <button key={s.address} className="chip" onClick={() => submit(s.chain, s.address, s.label)}>
            {chainById(s.chain).symbol} · {s.label}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
