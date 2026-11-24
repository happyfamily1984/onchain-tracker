import type { ReactNode } from 'react'
import { useBackHandler } from '../lib/back'
import { ago } from '../lib/format'

export function Header({ title, onBack, right, sub }: { title: ReactNode; onBack?: () => void; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="header">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      <div className="header-title">
        <h1>{title}</h1>
        {sub && <div className="header-sub">{sub}</div>}
      </div>
      <div className="header-right">{right}</div>
    </header>
  )
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button className={'icon-btn' + (loading ? ' spin' : '')} onClick={onClick} aria-label="새로고침">
      <svg viewBox="0 0 24 24" width="20" height="20"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  )
}

export function Updated({ at, error }: { at: number | null; error: string | null }) {
  if (error && !at) return <span className="err">{error}</span>
  return (
    <span>
      {at ? `${ago(at)} 업데이트` : '불러오는 중…'}
      {error && <span className="err"> · {error}</span>}
    </span>
  )
}

export function Stat({ label, value, sub, accent }: { label: ReactNode; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head"><h2>{title}</h2>{right}</div>
      {children}
    </section>
  )
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="progress"><div style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} /></div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  )
}

/** 모달 대화상자 — 뒤로가기로 닫힘 */
export function Dialog({ open, title, children, actions, onClose }: { open: boolean; title: string; children?: ReactNode; actions: ReactNode; onClose: () => void }) {
  useBackHandler(open, onClose)
  if (!open) return null
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children && <div className="dialog-body">{children}</div>}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  )
}

/** 하단 시트 — 뒤로가기로 닫힘 */
export function Sheet({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  useBackHandler(open, onClose)
  if (!open) return null
  return (
    <div className="overlay sheet-overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function CoinIcon({ symbol, color, size = 36 }: { symbol: string; color: string; size?: number }) {
  return (
    <div className="coin" style={{ width: size, height: size, background: color + '22', color, borderColor: color + '55', fontSize: size * (symbol.length > 3 ? 0.27 : 0.33) }}>
      {symbol}
    </div>
  )
}

export function openExternal(url: string) {
  window.open(url, '_blank', 'noopener')
}

export function Skeleton({ h = 64 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h }} />
}
