import { useState } from 'react'
import { useBackHandler } from '../lib/back'

const KEY = 'disclaimer:agreed:v1'

export const DISCLAIMER_LINES = [
  '이 앱의 모든 정보(시세, 온체인 지표, 고래 알림, 상승 가능성, 차트 분석)는 공개 데이터를 바탕으로 한 참고 자료예요.',
  '특정 코인을 사거나 팔라는 투자 권유가 아니며, 미래 가격을 보장하지 않아요.',
  '데이터는 외부 서비스에서 가져오므로 늦거나 틀릴 수 있어요.',
  '코인은 가격 변동이 매우 커서 원금 손실이 날 수 있어요.',
  '투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있어요.',
]

export function useDisclaimer() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) !== '1' } catch { return true } })
  return { open, agree: () => { try { localStorage.setItem(KEY, '1') } catch { /* ignore */ } setOpen(false) } }
}

/** 처음 실행 시 한 번 보여주는 투자 유의사항 */
export function Disclaimer({ open, onAgree }: { open: boolean; onAgree: () => void }) {
  useBackHandler(open, onAgree)
  if (!open) return null
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: 380 }}>
        <h3>⚠️ 투자 유의사항</h3>
        <ul className="disc-list">
          {DISCLAIMER_LINES.map((l, i) => <li key={i} className={i === DISCLAIMER_LINES.length - 1 ? 'strong' : ''}>{l}</li>)}
        </ul>
        <button className="btn full" onClick={onAgree}>확인했어요</button>
      </div>
    </div>
  )
}
