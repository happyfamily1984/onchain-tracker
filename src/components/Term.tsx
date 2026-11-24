import { useSyncExternalStore, type ReactNode } from 'react'
import { GLOSSARY } from '../lib/glossary'
import { Sheet } from './ui'

// 앱 전체에서 하나의 설명 시트를 공유
let current: string | null = null
const subs = new Set<() => void>()
const setCurrent = (k: string | null) => { current = k; subs.forEach((f) => f()) }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
const useCurrent = () => useSyncExternalStore(subscribe, () => current)

/** 누르면 쉬운 설명이 뜨는 용어 */
export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const t = GLOSSARY[k]
  return (
    <span className="term" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setCurrent(k) }}>
      {children ?? t?.word}<sup>ⓘ</sup>
    </span>
  )
}

export function TermSheet({ onGlossary }: { onGlossary: () => void }) {
  const k = useCurrent()
  const t = k ? GLOSSARY[k] : null
  return (
    <Sheet open={!!t} title={t ? `💡 ${t.word}` : ''} onClose={() => setCurrent(null)}>
      {t && (
        <div className="term-body">
          <p className="term-easy">{t.easy}</p>
          {t.more && <p className="dim">{t.more}</p>}
          <button className="btn ghost full" onClick={() => { setCurrent(null); onGlossary() }}>📖 용어 사전 전체 보기</button>
        </div>
      )}
    </Sheet>
  )
}
