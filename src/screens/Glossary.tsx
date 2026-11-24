import { useState } from 'react'
import { GLOSSARY } from '../lib/glossary'
import { Header } from '../components/ui'

export default function Glossary({ onBack }: { onBack: () => void }) {
  const [q, setQ] = useState('')
  const items = Object.entries(GLOSSARY).filter(([, t]) => !q || (t.word + t.easy).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="screen">
      <Header title="📖 쉬운 용어 사전" onBack={onBack} />
      <div className="content">
        <div className="search" style={{ marginTop: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="용어 검색 (예: 고래, 반감기)" />
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          {items.map(([k, t]) => (
            <div key={k} className="card" style={{ marginTop: 0 }}>
              <b>{t.word}</b>
              <p className="term-easy" style={{ margin: '6px 0 0' }}>{t.easy}</p>
              {t.more && <p className="dim small" style={{ margin: '6px 0 0', lineHeight: 1.6 }}>{t.more}</p>}
            </div>
          ))}
          {items.length === 0 && <div className="empty small">찾는 용어가 없어요</div>}
        </div>
      </div>
    </div>
  )
}
