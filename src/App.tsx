import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { refreshKrwRate } from './lib/api'
import { runTopBackHandler } from './lib/back'
import type { ChainId } from './lib/chains'
import { getSettings } from './lib/store'
import { Dialog } from './components/ui'
import Home from './screens/Home'
import ChainDetail from './screens/ChainDetail'
import Watchlist from './screens/Watchlist'
import Whales from './screens/Whales'
import AddressDetail from './screens/AddressDetail'
import Settings from './screens/Settings'
import Privacy from './screens/Privacy'

type Tab = 'home' | 'whale' | 'watch' | 'settings'
type Route =
  | { name: 'chain'; id: ChainId }
  | { name: 'address'; chain: 'bitcoin' | 'ethereum'; address: string }
  | { name: 'privacy' }

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [stack, setStack] = useState<Route[]>([])
  const [exitAsk, setExitAsk] = useState(false)

  const push = (r: Route) => { setStack((s) => [...s, r]); window.scrollTo(0, 0) }
  const pop = () => setStack((s) => s.slice(0, -1))

  // 뒤로가기: 열린 창/선택·수정 모드 → 이전 화면 → 홈 탭 → 종료 확인
  const state = useRef({ stack, tab, exitAsk })
  state.current = { stack, tab, exitAsk }
  const onBack = useCallback(() => {
    if (runTopBackHandler()) return
    const s = state.current
    if (s.stack.length) { pop(); return }
    if (s.tab !== 'home') { setTab('home'); return }
    setExitAsk(true)
  }, [])

  useEffect(() => {
    if (getSettings().currency === 'KRW') refreshKrwRate()
    if (Capacitor.isNativePlatform()) {
      const h = CapApp.addListener('backButton', onBack)
      return () => { h.then((x) => x.remove()) }
    }
    // 웹 미리보기: Esc 키를 뒤로가기로 사용
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onBack])

  const exitApp = () => {
    setExitAsk(false)
    if (Capacitor.isNativePlatform()) CapApp.exitApp()
    else window.close()
  }

  const top = stack[stack.length - 1]
  let screen
  if (top?.name === 'chain') screen = <ChainDetail key={top.id} id={top.id} onBack={pop} onAddress={(chain, address) => push({ name: 'address', chain, address })} />
  else if (top?.name === 'address') screen = <AddressDetail key={top.address} chain={top.chain} address={top.address} onBack={pop} />
  else if (top?.name === 'privacy') screen = <Privacy onBack={pop} />
  else if (tab === 'home') screen = <Home onOpen={(id) => push({ name: 'chain', id })} />
  else if (tab === 'whale') screen = <Whales onAddress={(chain, address) => push({ name: 'address', chain, address })} />
  else if (tab === 'watch') screen = <Watchlist onOpen={(w) => push({ name: 'address', chain: w.chain, address: w.address })} />
  else screen = <Settings onPrivacy={() => push({ name: 'privacy' })} />

  const goTab = (t: Tab) => { setStack([]); setTab(t); window.scrollTo(0, 0) }

  return (
    <div className="app">
      <main>{screen}</main>
      {!top && (
        <nav className="tabbar">
          {([
            ['home', '홈', 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
            ['whale', '고래', 'M2 13c2-5 7-7 12-6 3 .6 5 2.4 6 4l2-3v8l-2-2c-1.5 3-5 5-10 4.5C6 18 3 16 2 13zM16 11h.01'],
            ['watch', '관심 주소', 'M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z'],
            ['settings', '설정', 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.3 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z'],
          ] as const).map(([t, l, d]) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => goTab(t)}>
              <svg viewBox="0 0 24 24" width="22" height="22"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
              <span>{l}</span>
            </button>
          ))}
        </nav>
      )}
      <Dialog
        open={exitAsk}
        title="앱을 종료하겠습니까?"
        onClose={() => setExitAsk(false)}
        actions={<>
          <button className="text-btn" onClick={() => setExitAsk(false)}>아니오</button>
          <button className="text-btn primary" onClick={exitApp}>예</button>
        </>}
      />
    </div>
  )
}
