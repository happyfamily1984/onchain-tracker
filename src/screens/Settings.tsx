import { useState } from 'react'
import { refreshKrwRate } from '../lib/api'
import { checkAlerts, ensureNotifyPermission } from '../lib/alerts'
import { num } from '../lib/format'
import { updateSettings, useSettings } from '../lib/store'
import { Dialog, Header, Section, Segmented, openExternal } from '../components/ui'

function Toggle({ label, sub, on, onChange }: { label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="toggle-row" onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span><b>{label}</b>{sub && <span className="dim small"><br />{sub}</span>}</span>
      <span className={'switch' + (on ? ' on' : '')}><span /></span>
    </button>
  )
}

export const APP_VERSION = '1.2.0'

export default function Settings({ onPrivacy, onGlossary }: { onPrivacy: () => void; onGlossary: () => void }) {
  const s = useSettings()
  const [clearOpen, setClearOpen] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <div className="screen">
      <Header title="설정" />
      <div className="content">
        <button className="card link-row" style={{ marginTop: 6, padding: '14px' }} onClick={onGlossary}>
          <span><b>📖 쉬운 용어 사전</b><span className="dim small"><br />고래, 반감기, 멤풀… 어려운 말을 쉽게 풀어 드려요</span></span>
          <span className="dim">›</span>
        </button>

        <Section title="표시">
          <div className="card">
            <div className="kv"><span>표시 통화</span>
              <Segmented value={s.currency} onChange={(v) => { updateSettings({ currency: v }); if (v === 'KRW') refreshKrwRate() }} options={[{ v: 'KRW', l: '원화' }, { v: 'USD', l: '달러' }]} />
            </div>
            {s.currency === 'KRW' && <div className="kv dim small"><span>적용 환율</span><span>{s.krwRate ? `1 USD = ₩${num(s.krwRate, 2)}` : '불러오는 중'}</span></div>}
            <div className="kv"><span>자동 새로고침</span>
              <Segmented value={String(s.refreshSec)} onChange={(v) => updateSettings({ refreshSec: Number(v) })} options={[{ v: '30', l: '30초' }, { v: '60', l: '1분' }, { v: '300', l: '5분' }]} />
            </div>
          </div>
        </Section>

        <Section title="🚨 큰손이 거래소로 보내면 알림">
          <div className="card">
            <Toggle label="비트코인 큰손" sub="큰손이 거래소로 비트코인을 보내면(팔 준비 신호) 알려줘요" on={s.alertBtc} onChange={(v) => { updateSettings({ alertBtc: v }); if (v) { ensureNotifyPermission(); checkAlerts() } }} />
            {s.alertBtc && (
              <div className="kv"><span className="dim small">이만큼 이상 보내면</span>
                <Segmented value={String(s.alertMinBtc)} onChange={(v) => updateSettings({ alertMinBtc: Number(v) })} options={[{ v: '100', l: '100개+' }, { v: '500', l: '500개+' }, { v: '1000', l: '1,000개+' }]} />
              </div>
            )}
            <Toggle label="이더리움 큰손" sub="새 거래를 계속 확인해요 (인터넷 데이터를 많이 써요)" on={s.alertEth} onChange={(v) => { updateSettings({ alertEth: v }); if (v) { ensureNotifyPermission(); checkAlerts() } }} />
            {s.alertEth && (
              <div className="kv"><span className="dim small">이만큼 이상 보내면</span>
                <Segmented value={String(s.alertMinEth)} onChange={(v) => updateSettings({ alertMinEth: Number(v) })} options={[{ v: '100', l: '100개+' }, { v: '500', l: '500개+' }, { v: '1000', l: '1,000개+' }]} />
              </div>
            )}
            <Toggle label="내 관심 주소" sub="관심 주소에 등록한 지갑이 거래소로 보내면 알려줘요" on={s.alertWatch} onChange={(v) => { updateSettings({ alertWatch: v }); if (v) { ensureNotifyPermission(); checkAlerts() } }} />
          </div>
          <p className="dim small pad">앱이 켜져 있을 때 주기적으로 확인하고, 앱을 다시 열면 바로 확인해요. 앱을 완전히 끄면 확인하지 않아요.</p>
        </Section>

        <Section title="데이터 출처">
          <div className="card links">
            {[
              ['Blockchair', '멀티체인 통계', 'https://blockchair.com'],
              ['mempool.space', '비트코인 수수료·멤풀·블록', 'https://mempool.space'],
              ['blockchain.com', '비트코인 추이 차트', 'https://www.blockchain.com/explorer/charts'],
              ['Blockscout', '이더리움 가스·블록·주소', 'https://eth.blockscout.com'],
              ['PublicNode RPC', '솔라나 TPS · 이더리움 고래·스테이블코인 흐름', 'https://www.publicnode.com'],
              ['ExchangeRate-API', 'USD/KRW 환율', 'https://www.exchangerate-api.com'],
            ].map(([n, d, u]) => (
              <button key={n} className="link-row" onClick={() => openExternal(u)}><b>{n}</b><span className="dim small">{d}</span></button>
            ))}
          </div>
          <p className="dim small pad">제공되는 정보는 참고용이며 투자 조언이 아닙니다. 데이터는 외부 공개 API에서 가져오므로 지연되거나 일시적으로 누락될 수 있습니다.</p>
        </Section>

        <Section title="앱 정보">
          <div className="card links">
            <button className="link-row" onClick={onPrivacy}><b>개인정보 처리방침</b><span className="dim">›</span></button>
            <button className="link-row" onClick={() => setClearOpen(true)}><b>캐시 데이터 삭제</b><span className="dim small">{done ? '삭제됨' : '관심 주소는 유지'}</span></button>
            <div className="link-row"><b>버전</b><span className="dim">{APP_VERSION}</span></div>
          </div>
        </Section>
      </div>
      <Dialog
        open={clearOpen}
        title="캐시 삭제"
        onClose={() => setClearOpen(false)}
        actions={<>
          <button className="text-btn" onClick={() => setClearOpen(false)}>취소</button>
          <button className="text-btn danger" onClick={() => {
            Object.keys(localStorage).filter((k) => k.startsWith('cache:')).forEach((k) => localStorage.removeItem(k))
            setClearOpen(false); setDone(true)
          }}>삭제</button>
        </>}
      >
        저장된 시세·통계 캐시를 삭제할까요? 관심 주소와 설정은 유지됩니다.
      </Dialog>
    </div>
  )
}
