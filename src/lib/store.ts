import { useSyncExternalStore } from 'react'

export interface Settings {
  currency: 'USD' | 'KRW'
  refreshSec: number
  krwRate: number | null
  /** 고래 → 거래소 입금 알림 */
  alertBtc: boolean
  alertEth: boolean
  alertMinBtc: number
  alertMinEth: number
  /** 관심 주소가 거래소로 보낼 때 알림 */
  alertWatch: boolean
}

export interface WatchItem {
  id: string
  chain: 'bitcoin' | 'ethereum'
  address: string
  label: string
  addedAt: number
}

interface State {
  settings: Settings
  watch: WatchItem[]
}

const KEY = 'onchain-tracker:v1'
const defaults: State = {
  settings: { currency: 'KRW', refreshSec: 60, krwRate: null, alertBtc: true, alertEth: false, alertMinBtc: 100, alertMinEth: 500, alertWatch: true },
  watch: [],
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults
    const s = JSON.parse(raw)
    return { settings: { ...defaults.settings, ...s.settings }, watch: Array.isArray(s.watch) ? s.watch : [] }
  } catch {
    return defaults
  }
}

let state: State = load()
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* 저장 불가 환경 */ }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }

export const getSettings = () => state.settings
export const getWatch = () => state.watch
export const useSettings = () => useSyncExternalStore(subscribe, () => state.settings)
export const useWatch = () => useSyncExternalStore(subscribe, () => state.watch)

export function updateSettings(patch: Partial<Settings>) {
  set({ ...state, settings: { ...state.settings, ...patch } })
}

export function addWatch(item: Omit<WatchItem, 'id' | 'addedAt'>) {
  const exists = state.watch.some((w) => w.chain === item.chain && w.address.toLowerCase() === item.address.toLowerCase())
  if (exists) return false
  set({ ...state, watch: [...state.watch, { ...item, id: Math.random().toString(36).slice(2), addedAt: Date.now() }] })
  return true
}

export function removeWatch(ids: string[]) {
  set({ ...state, watch: state.watch.filter((w) => !ids.includes(w.id)) })
}

export function renameWatch(id: string, label: string) {
  set({ ...state, watch: state.watch.map((w) => (w.id === id ? { ...w, label } : w)) })
}
