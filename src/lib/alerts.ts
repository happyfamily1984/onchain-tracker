/**
 * 고래 → 거래소 입금 감지 알림
 * - 고래 스캔 결과 중 '거래소 입금'(비거래소 지갑 → 거래소 지갑) 거래
 * - 관심 주소에서 거래소 지갑으로 보낸 거래
 * 새로 감지되면 알림함에 쌓고 휴대폰 알림을 띄운다. (앱이 실행 중일 때 동작)
 */
import { useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { fetchAddress } from './api'
import { getSettings, getWatch } from './store'
import { fetchBtcWhales, fetchEthWhales, labelOf, probeActivity } from './whale'
import { num, shortHash } from './format'

export interface Alert {
  id: string
  chain: 'bitcoin' | 'ethereum'
  hash: string
  amount: number
  exchange: string
  from: string
  fromLabel: string | null
  time: number
  source: 'whale' | 'watch'
  read: boolean
  /** 장기보유자 물량 비중(%) */
  lthPct?: number
}

const KEY = 'alerts:v1'
const SEEN = 'alerts:seen'
const MAX = 100

let alerts: Alert[] = []
let seen = new Set<string>()
try {
  alerts = JSON.parse(localStorage.getItem(KEY) || '[]')
  seen = new Set(JSON.parse(localStorage.getItem(SEEN) || '[]'))
} catch { /* ignore */ }

const listeners = new Set<() => void>()
const emit = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(alerts.slice(0, MAX)))
    localStorage.setItem(SEEN, JSON.stringify([...seen].slice(-1500)))
  } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }
export const useAlerts = () => useSyncExternalStore(subscribe, () => alerts)

export function markAllRead() { alerts = alerts.map((a) => ({ ...a, read: true })); emit() }
export function clearAlerts() { alerts = []; emit() }

/** 알림 권한 요청 (안드로이드 13+) */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    let p = await LocalNotifications.checkPermissions()
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions()
    return p.display === 'granted'
  } catch { return false }
}

const SYM = { bitcoin: 'BTC', ethereum: 'ETH' } as const
let nid = Math.floor(Date.now() / 1000) % 100000

async function notify(list: Alert[]) {
  if (!list.length || !Capacitor.isNativePlatform()) return
  try {
    const ok = (await LocalNotifications.checkPermissions()).display === 'granted'
    if (!ok) return
    const items = list.slice(0, 5).map((a) => ({
      id: ++nid,
      title: a.source === 'watch' ? `👀 관심 주소 → ${a.exchange} 입금` : `🐋 고래 → ${a.exchange} 입금`,
      body: `${num(a.amount, a.amount >= 1000 ? 0 : 2)} ${SYM[a.chain]} · ${a.fromLabel ?? shortHash(a.from, 6)}에서 이동${a.lthPct != null ? (a.lthPct >= 50 ? ` · 장기보유 물량 ${a.lthPct}%` : ` · 단기보유 물량 ${100 - a.lthPct}%`) : ''}`,
    }))
    if (list.length > 5) items.push({ id: ++nid, title: '🐋 거래소 입금 다수 감지', body: `외 ${list.length - 5}건 — 앱에서 확인하세요` })
    await LocalNotifications.schedule({ notifications: items })
  } catch { /* ignore */ }
}

let running = false

/** 한 번 검사. 처음 실행 시에는 기존 거래를 알림 없이 기록만 한다. */
export async function checkAlerts(): Promise<number> {
  if (running) return 0
  running = true
  const firstRun = seen.size === 0
  const s = getSettings()
  const watch = getWatch()
  const userLabels = Object.fromEntries(watch.filter((w) => w.label).map((w) => [w.address.toLowerCase(), w.label]))
  const found: Alert[] = []
  const add = (a: Omit<Alert, 'id' | 'read'>) => {
    const id = `${a.source}:${a.hash}`
    if (seen.has(id)) return
    seen.add(id)
    found.push({ ...a, id, read: false })
  }
  try {
    const jobs: Promise<void>[] = []
    if (s.alertBtc) jobs.push(fetchBtcWhales(s.alertMinBtc, userLabels).then((r) => {
      for (const t of r.txs) if (t.kind === 'deposit') {
        const known = t.age ? t.age.lth + t.age.sth : 0
        add({ chain: 'bitcoin', hash: t.hash, amount: t.amount, exchange: t.exchange ?? '거래소', from: t.from[0]?.address ?? '', fromLabel: t.from[0]?.label ?? null, time: (t.time ?? 0) * 1000 || Date.now(), source: 'whale', lthPct: known ? Math.round((t.age!.lth / known) * 100) : undefined })
      }
    }).catch(() => {}))
    if (s.alertEth) jobs.push(fetchEthWhales(s.alertMinEth, userLabels).then((r) => {
      for (const t of r.txs) if (t.kind === 'deposit') add({ chain: 'ethereum', hash: t.hash, amount: t.amount, exchange: t.exchange ?? '거래소', from: t.from[0]?.address ?? '', fromLabel: t.from[0]?.label ?? null, time: (t.time ?? 0) * 1000 || Date.now(), source: 'whale' })
    }).catch(() => {}))
    if (s.alertWatch) for (const w of watch) jobs.push((async () => {
      try {
        const info = await fetchAddress(w.chain, w.address)
        const outs = info.txs.filter((t) => t.delta < 0).slice(0, 10)
        await probeActivity(w.chain, outs.flatMap((t) => t.counterparties.slice(0, 2)))
        for (const t of outs) {
          const ex = t.counterparties.map((c) => labelOf(c, {})).find((p) => p.exchange)
          if (ex) add({ chain: w.chain, hash: t.hash, amount: Math.abs(t.delta), exchange: ex.label ?? '거래소', from: w.address, fromLabel: w.label || null, time: t.time ?? Date.now(), source: 'watch' })
        }
      } catch { /* 건너뜀 */ }
    })())
    await Promise.all(jobs)
  } finally {
    running = false
  }
  if (found.length) {
    found.sort((a, b) => b.time - a.time)
    // 첫 실행에서 발견된 기존 거래는 읽음 처리, 알림 없음
    if (firstRun) found.forEach((a) => (a.read = true))
    alerts = [...found, ...alerts].slice(0, MAX)
    emit()
    if (!firstRun) await notify(found)
  } else if (firstRun) {
    seen.add('init'); emit()
  }
  return found.length
}
