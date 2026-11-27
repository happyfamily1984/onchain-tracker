import { useState } from 'react'
import { useBackHandler } from '../lib/back'
import { useWatch, type WatchItem } from '../lib/store'
import Whales from './Whales'
import Watchlist from './Watchlist'

type Sub = 'whale' | 'watch'
const memo: { sub: Sub } = { sub: 'whale' }

/** 고래 메뉴: 큰손 추적 + 관심 주소 */
export default function WhaleHub({ onAddress, onWatch }: { onAddress: (chain: 'bitcoin' | 'ethereum', address: string) => void; onWatch: (w: WatchItem) => void }) {
  const [sub, setSubS] = useState<Sub>(memo.sub)
  const setSub = (s: Sub) => { memo.sub = s; setSubS(s); window.scrollTo(0, 0) }
  const watch = useWatch()
  // 관심 주소 화면에서 뒤로가기 → 큰손 추적으로
  useBackHandler(sub === 'watch', () => setSub('whale'))
  const tabs = (
    <div className="subtabs">
      <button className={sub === 'whale' ? 'on' : ''} onClick={() => setSub('whale')}>🐋 큰손 추적</button>
      <button className={sub === 'watch' ? 'on' : ''} onClick={() => setSub('watch')}>⭐ 관심 주소{watch.length ? ` ${watch.length}` : ''}</button>
    </div>
  )
  return sub === 'whale' ? <Whales onAddress={onAddress} subtabs={tabs} /> : <Watchlist onOpen={onWatch} subtabs={tabs} />
}
