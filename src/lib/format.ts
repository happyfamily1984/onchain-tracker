import { getSettings } from './store'

const nf = (max = 2, min = 0) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: max, minimumFractionDigits: min })

/** 한국식 큰 수 단위(만·억·조) */
export function krUnit(n: number, digits = 2): string {
  if (!isFinite(n)) return '-'
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1e16) return s + nf(digits).format(a / 1e16) + '경'
  if (a >= 1e12) return s + nf(digits).format(a / 1e12) + '조'
  if (a >= 1e8) return s + nf(digits).format(a / 1e8) + '억'
  if (a >= 1e4) return s + nf(digits).format(a / 1e4) + '만'
  return s + nf(digits).format(a)
}

export function num(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '-'
  return nf(digits).format(n)
}

export function compact(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '-'
  return krUnit(n, digits)
}

/** 설정된 통화(USD/KRW)로 금액 표기 */
export function money(usd: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (usd == null || !isFinite(usd)) return '-'
  const { currency, krwRate } = getSettings()
  if (currency === 'KRW' && krwRate) {
    const v = usd * krwRate
    if (opts.compact && Math.abs(v) >= 1e4) return '₩' + krUnit(v, 2)
    return '₩' + nf(Math.abs(v) < 10 ? 2 : 0).format(v)
  }
  if (opts.compact && Math.abs(usd) >= 1e4) return '$' + krUnit(usd, 2)
  const a = Math.abs(usd)
  const d = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6
  return '$' + nf(d, a >= 1 && a < 1000 ? 2 : 0).format(usd)
}

export function pct(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '-'
  return (n > 0 ? '+' : '') + n.toFixed(digits) + '%'
}

const HASH_UNITS = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s', 'ZH/s']
export function hashrate(h: number | null | undefined): string {
  if (h == null || !isFinite(h) || h <= 0) return '-'
  let i = 0
  while (h >= 1000 && i < HASH_UNITS.length - 1) { h /= 1000; i++ }
  return nf(2).format(h) + ' ' + HASH_UNITS[i]
}

export function bytes(b: number | null | undefined): string {
  if (b == null || !isFinite(b)) return '-'
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let i = 0
  while (b >= 1000 && i < u.length - 1) { b /= 1000; i++ }
  return nf(2).format(b) + ' ' + u[i]
}

export function ago(t: number | string | Date): string {
  const ms = typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : new Date(t).getTime()
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}초 전`
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

export function duration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '-'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}일 ${h}시간`
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}

export function dateStr(t: number | string, withTime = false): string {
  const ms = typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : new Date(t).getTime()
  const d = new Date(ms)
  const p = (x: number) => String(x).padStart(2, '0')
  const base = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
  return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base
}

export const shortHash = (h: string, n = 6) => (h && h.length > n * 2 + 2 ? `${h.slice(0, n)}…${h.slice(-n)}` : h)
