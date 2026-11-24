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

export const APP_VERSION = '1.0.0'

export default function Settings({ onPrivacy }: { onPrivacy: () => void }) {
  const s = useSettings()
  const [clearOpen, setClearOpen] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <div className="screen">
      <Header title="설정" />
      <div className="content">
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

        <Section title="고래 → 거래소 입금 알림">
          <div className="card">
            <Toggle label="비트코인 고래 입금" sub="최근 블록에서 고래 지갑 → 거래소 입금 감지" on={s.alertBtc} onChange={(v) => { updateSettings({ alertBtc: v }); if (v) { ensureNotifyPermission(); checkAlerts() } }} />
            {s.alertBtc && (
              <div className="kv"><span className="dim small">기준</span>
                <Segmented value={String(s.alertMinBtc)} onChange={(v) => updateSettings({ alertMinBtc: Number(v) })} options={[{ v: '100', l: '100 BTC+' }, { v: '500', l: '500+' }, { v: '1000', l: '1,000+' }]} />
              </div>
            )}
            <Toggle label="이더리움 고래 입금" sub="새 블록을 계속 스캔 (데이터 사용량 많음)" on={s.alertEth} onChange={(v) => { updateSettings({ alertEth: v }); if (v) { ensureNotifyPermission(); checkAlerts() } }} />
            {s.alertEth && (
              <div className="kv"><span className="dim small">기준</span>
                <Segmented value={String(s.alertMinEth)} onChange={(v) => updateSettings({ alertMinEth: Number(v) })} options={[{ v: '100', l: '100 ETH+' }, { v: '500', l: '500+' }, { v: '1000', l: '1,000+' }]} />
              </div>
            )}
            <Toggle label="관심 주소 → 거래소 입금" sub="등록한 지갑이 거래소로 보내면 알림" on={s.alertWatch} onChange={(v) => { updateSettings({ alertWatch: v }); if (v) { ensureNotifyPermission(); checkAlerts() } }} />
          </div>
          <p className="dim small pad">앱이 실행 중일 때 새로고침 간격마다 검사하고, 앱을 다시 열면 즉시 검사합니다. 앱을 완전히 종료한 동안에는 감시하지 않습니다.</p>
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
